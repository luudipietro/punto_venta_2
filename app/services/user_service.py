from fastapi import Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleViolationError, EntityNotFoundError
from app.core.security import hash_password, verify_password
from app.domain.user import User, UserRole
from app.infrastructure.db.session import get_db
from app.repositories.branch_repository import BranchRepository, SqlAlchemyBranchRepository
from app.repositories.user_repository import SqlAlchemyUserRepository, UserRepository
from app.services.audit_log_service import AuditLogService, get_audit_log_service


class UserService:
    """Not a `CrudService` subclass — password hashing and the role/branch
    consistency rule (empleado requires a branch, admin must not have one)
    are exactly the kind of "real business rule" `CrudService`'s own
    docstring says warrants skipping the generic base."""

    entity_name = "User"

    def __init__(
        self,
        repository: UserRepository,
        branch_repository: BranchRepository,
        audit: AuditLogService | None = None,
    ) -> None:
        self._repository = repository
        self._branch_repository = branch_repository
        self._audit = audit

    async def list_all(self) -> list[User]:
        return await self._repository.list_all()

    async def get_by_id(self, user_id: int) -> User:
        user = await self._repository.get_by_id(user_id)
        if user is None:
            raise EntityNotFoundError("User", user_id)
        return user

    async def _validate_role_branch(self, role: UserRole, branch_id: int | None) -> None:
        if role == UserRole.EMPLEADO and branch_id is None:
            raise BusinessRuleViolationError("Un empleado debe tener una sucursal asignada")
        if role == UserRole.ADMIN and branch_id is not None:
            raise BusinessRuleViolationError("Un administrador no debe tener una sucursal fija")
        if branch_id is not None and await self._branch_repository.get_by_id(branch_id) is None:
            raise EntityNotFoundError("Branch", branch_id)

    async def create(
        self,
        username: str,
        password: str,
        role: UserRole,
        branch_id: int | None,
        *,
        acting_user: User | None = None,
    ) -> User:
        await self._validate_role_branch(role, branch_id)
        user = User(
            username=username,
            password_hash=hash_password(password),
            role=role,
            branch_id=branch_id,
        )
        try:
            created = await self._repository.create(user)
        except IntegrityError as exc:
            raise BusinessRuleViolationError(f"Ya existe un usuario con nombre {username}") from exc
        if self._audit is not None:
            await self._audit.record(
                acting_user,
                "user.create",
                "User",
                created.id,
                branch_id=created.branch_id,
                summary=f"Creó el usuario {created.username}",
            )
        return created

    async def update(
        self,
        user_id: int,
        username: str,
        role: UserRole,
        branch_id: int | None,
        password: str | None = None,
        *,
        current_password: str | None = None,
        acting_user: User | None = None,
    ) -> User:
        existing = await self.get_by_id(user_id)
        await self._validate_role_branch(role, branch_id)

        # A user changing their OWN password must prove they know the
        # current one — otherwise an unattended/stolen admin session could
        # be used to silently take over the account by setting a new
        # password with nothing but the browser tab already being open.
        # Resetting ANOTHER user's password (acting_user.id != user_id) is
        # a legitimate admin action and stays unrestricted.
        if password and acting_user is not None and acting_user.id == user_id:
            if not current_password or not verify_password(
                current_password, existing.password_hash
            ):
                raise BusinessRuleViolationError(
                    "La contraseña actual es incorrecta o no fue provista"
                )

        password_hash = hash_password(password) if password else existing.password_hash
        user = User(
            id=user_id,
            username=username,
            password_hash=password_hash,
            role=role,
            branch_id=branch_id,
        )
        try:
            updated = await self._repository.update(user)
        except IntegrityError as exc:
            raise BusinessRuleViolationError(f"Ya existe un usuario con nombre {username}") from exc
        if self._audit is not None:
            await self._audit.record(
                acting_user,
                "user.update",
                "User",
                user_id,
                branch_id=updated.branch_id,
                summary=f"Actualizó el usuario {updated.username}",
            )
        return updated

    async def delete(self, user_id: int, *, acting_user: User | None = None) -> None:
        existing = await self.get_by_id(user_id)
        await self._repository.delete(user_id)
        if self._audit is not None:
            await self._audit.record(
                acting_user,
                "user.delete",
                "User",
                user_id,
                branch_id=existing.branch_id,
                summary=f"Eliminó el usuario {existing.username}",
            )

    async def authenticate(self, username: str, password: str) -> User:
        user = await self._repository.get_by_username(username)
        if user is None or not verify_password(password, user.password_hash):
            raise BusinessRuleViolationError("Usuario o contraseña incorrectos")
        return user


def get_user_service(
    session: AsyncSession = Depends(get_db),
    audit: AuditLogService = Depends(get_audit_log_service),
) -> UserService:
    return UserService(
        SqlAlchemyUserRepository(session), SqlAlchemyBranchRepository(session), audit
    )

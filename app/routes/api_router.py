from fastapi import APIRouter, Depends

from app.core.auth import get_current_user
from app.routes.audit_log_route import router as audit_log_router
from app.routes.auth_route import router as auth_router
from app.routes.branch_route import router as branch_router
from app.routes.brand_route import router as brand_router
from app.routes.brand_settings_route import router as brand_settings_router
from app.routes.category_route import router as category_router
from app.routes.color_route import router as color_router
from app.routes.customer_route import router as customer_router
from app.routes.exchange_route import router as exchange_router
from app.routes.expense_route import router as expense_router
from app.routes.payment_method_route import router as payment_method_router
from app.routes.product_route import router as product_router
from app.routes.promotion_route import router as promotion_router
from app.routes.purchase_route import router as purchase_router
from app.routes.report_route import router as report_router
from app.routes.sale_route import router as sale_router
from app.routes.size_route import router as size_router
from app.routes.stock_route import router as stock_router
from app.routes.storefront_route import router as storefront_router
from app.routes.upload_route import router as upload_router
from app.routes.user_route import router as user_router

api_router = APIRouter()

_auth_required = [Depends(get_current_user)]

# /auth/login has no dependency (must be reachable unauthenticated);
# /auth/me and /users are gated on their own (see auth_route.py/user_route.py).
api_router.include_router(auth_router)
api_router.include_router(user_router)

# Reads open to any logged-in user, admin-only on the mutating endpoints
# (see the `dependencies=[Depends(require_admin)]` on each POST/PUT/DELETE
# in these route files).
api_router.include_router(category_router, dependencies=_auth_required)
api_router.include_router(brand_router, dependencies=_auth_required)
api_router.include_router(color_router, dependencies=_auth_required)
api_router.include_router(size_router, dependencies=_auth_required)
api_router.include_router(branch_router, dependencies=_auth_required)
api_router.include_router(product_router, dependencies=_auth_required)
api_router.include_router(payment_method_router, dependencies=_auth_required)
api_router.include_router(promotion_router, dependencies=_auth_required)

# GET is intentionally public (no dependency) — the login page itself needs
# to render the custom logo/company name before anyone is authenticated.
# PUT is admin-only via its own route-level dependency (brand_settings_route.py).
api_router.include_router(brand_settings_router)

# Entirely public, no dependency — the customer-facing storefront (a
# separate frontend, `storefront/`) has no login at all, it's a read-only
# catalog that hands off to WhatsApp for the actual order.
api_router.include_router(storefront_router)

# Uniformly open to any logged-in user — branch-scoping for empleados is
# enforced inside the service layer, not via router-level role gating.
api_router.include_router(customer_router, dependencies=_auth_required)
api_router.include_router(stock_router, dependencies=_auth_required)
api_router.include_router(purchase_router, dependencies=_auth_required)
api_router.include_router(sale_router, dependencies=_auth_required)
api_router.include_router(exchange_router, dependencies=_auth_required)
api_router.include_router(expense_router, dependencies=_auth_required)
api_router.include_router(upload_router, dependencies=_auth_required)

# Admin-only in their entirety (router-level `Depends(require_admin)` set in
# their own files) — traceability and financial analytics.
api_router.include_router(audit_log_router)
api_router.include_router(report_router)

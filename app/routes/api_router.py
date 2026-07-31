from fastapi import APIRouter

from app.routes.branch_route import router as branch_router
from app.routes.brand_route import router as brand_router
from app.routes.category_route import router as category_router
from app.routes.color_route import router as color_router
from app.routes.exchange_route import router as exchange_router
from app.routes.payment_method_route import router as payment_method_router
from app.routes.product_route import router as product_router
from app.routes.promotion_route import router as promotion_router
from app.routes.purchase_route import router as purchase_router
from app.routes.sale_route import router as sale_router
from app.routes.size_route import router as size_router
from app.routes.stock_route import router as stock_router

api_router = APIRouter()

api_router.include_router(category_router)
api_router.include_router(brand_router)
api_router.include_router(color_router)
api_router.include_router(size_router)
api_router.include_router(branch_router)
api_router.include_router(product_router)
api_router.include_router(stock_router)
api_router.include_router(payment_method_router)
api_router.include_router(promotion_router)
api_router.include_router(purchase_router)
api_router.include_router(sale_router)
api_router.include_router(exchange_router)

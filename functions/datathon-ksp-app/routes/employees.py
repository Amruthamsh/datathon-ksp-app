from fastapi import APIRouter, Depends, Query

from db.dependencies import get_employee_repository
from db.repository import EmployeeRepository

router = APIRouter(
    prefix="/employees",
    tags=["Employees"],
)

@router.get("")
def get_employees(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    repository: EmployeeRepository = Depends(get_employee_repository),
):
    return repository.get_employees(page, page_size)
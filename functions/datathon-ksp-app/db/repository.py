from abc import ABC, abstractmethod

class EmployeeRepository(ABC):

    @abstractmethod
    def get_employees(
        self,
        page: int,
        page_size: int,
    ):
        pass
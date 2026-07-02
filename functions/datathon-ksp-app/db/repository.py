from abc import ABC, abstractmethod

class EmployeeRepository(ABC):

    @abstractmethod
    def get_employees(
        self,
        page: int,
        page_size: int,
    ):
        pass

class MetadataRepository(ABC):

    @abstractmethod
    def get_schemas(self):
        pass

    @abstractmethod
    def get_distinct_values(self, table_name, column_name):
        pass

    @abstractmethod
    def execute_sql(self, query):
        pass


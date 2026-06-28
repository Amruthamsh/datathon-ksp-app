from abc import ABC, abstractmethod

class LLMService(ABC):
    @abstractmethod
    def generate(self, user_prompt: str, system_prompt: str | None = None) -> str:
        pass
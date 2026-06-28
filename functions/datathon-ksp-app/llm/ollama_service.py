from ollama import Client
from llm.llm_service import LLMService

class OllamaService(LLMService):
    def __init__(self, host, model):
        self.client = Client(host=host)
        self.model = model

    def generate(self, user_prompt: str, system_prompt: str | None = None) -> str:
        messages = []
        if system_prompt:
            messages.append({
                "role": "system",
                "content": system_prompt
            })

        messages.append({
            "role": "user",
            "content": user_prompt
        })

        response = self.client.chat(
            model=self.model,
            messages=messages,
            think=False
        )

        return response["message"]["content"]
    
    def stream(self, user_prompt: str, system_prompt: str | None = None):
        messages = []

        if system_prompt:
            messages.append({
                "role": "system",
                "content": system_prompt,
            })

        messages.append({
            "role": "user",
            "content": user_prompt,
        })

        print("Calling Ollama...")

        stream = self.client.chat(
            model=self.model,
            messages=messages,
            stream=True,
        )

        print("Got stream object")

        for chunk in stream:
            content = chunk["message"]["content"]
            print(f"Received chunk: {content}")
            if content:
                yield content
    
ollama_service = OllamaService(host="http://localhost:11434", model="gemma4:e4b")
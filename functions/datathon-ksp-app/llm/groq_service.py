from groq import Groq
from llm.llm_service import LLMService
import os
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("GROQ_API_KEY")

class GroqService(LLMService):
    def __init__(self, host, model):
        self.client = Groq(api_key=api_key)
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

        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0.2,
            max_completion_tokens=7000,
            top_p=1,
            reasoning_effort="low",
            stream=False,
            stop=None
        )

        return response["choices"][0]["message"]["content"]
    

groq_service = GroqService(host=None, model="openai/gpt-oss-20b")
    
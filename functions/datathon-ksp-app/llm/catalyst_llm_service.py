import json
import urllib.request
import urllib.error

from llm.llm_service import LLMService

_ENDPOINT = "https://api.catalyst.zoho.in/quickml/v1/project/47078000000013025/glm/chat"
_ORG_ID = "60073558955"
_MODEL = "crm-di-glm47b_30b_it"


class CatalystLLMService(LLMService):
    def __init__(self):
        self._catalyst_app = None
        self.endpoint = _ENDPOINT
        self.org_id = _ORG_ID
        self.model = _MODEL

    def set_catalyst_app(self, app):
        self._catalyst_app = app

    def _get_access_token(self) -> str:
        if not self._catalyst_app:
            raise RuntimeError(
                "Catalyst app not initialized. Call set_catalyst_app() first."
            )
        # token() returns a tuple: (credential_type_name, token_value)
        _cred_type, token = self._catalyst_app.credential.token()
        return token

    def generate(self, user_prompt: str, system_prompt: str | None = None) -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_prompt})

        payload = json.dumps({
            "model": self.model,
            "messages": messages,
            "max_tokens": 6000,
            "temperature": 0.2,
            "stream": False,
            "chat_template_kwargs": {
                "enable_thinking": False,
            },
        }).encode("utf-8")

        token = self._get_access_token()

        req = urllib.request.Request(
            self.endpoint,
            data=payload,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Zoho-oauthtoken {token}",
                "CATALYST-ORG": self.org_id,
            },
        )

        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            raise RuntimeError(f"Zoho LLM HTTP {e.code}: {error_body}") from e

        response = body["response"]
        print(f"Zoho LLM body: {body}")  # Debugging log
        print(f"Zoho LLM response: {response}")  # Debugging log
        return response


catalyst_llm_service = CatalystLLMService()

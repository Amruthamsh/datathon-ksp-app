from datetime import datetime, timezone
from typing import Optional
import uuid
import json

from zcatalyst_sdk.nosql.transfom import Item


def _serialize(doc: dict) -> dict:
    """Convert a plain Python dict to Catalyst NoSQL typed format e.g. {'key': {'S': 'val'}}."""
    return Item.to_nosql(doc)


def _deserialize_items(response) -> list:
    """Extract plain Python dicts from a NoSqlResponse.get list."""
    return [r.get("item", {}) for r in (response.get or [])]


class ChatRepository:
    def __init__(self, catalyst_app):
        self.table = catalyst_app.nosql().get_table("messages")

    def save_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        analysis: Optional[dict] = None,
    ) -> dict:
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "conversation_id": conversation_id,
            "created_at": now,
            "message_id": str(uuid.uuid4()),
            "role": role,
            "content": content,
        }
        # Store analysis as a JSON string to avoid DynamoDB float-type restrictions
        if analysis is not None:
            doc["analysis"] = json.dumps(analysis)

        self.table.insert_items({"item": _serialize(doc)})
        return doc

    def delete_messages(self, conversation_id: str) -> None:
        try:
            result = self.table.query_table({
                "key_condition": {
                    "attribute": "conversation_id",
                    "operator": "equals",
                    "value": {"S": conversation_id},
                },
                "forward_scan": True,
                "limit": 1000,
            })
            items = _deserialize_items(result)
            for item in items:
                try:
                    self.table.delete_items({
                        "keys": {
                            "conversation_id": {"S": item["conversation_id"]},
                            "created_at": {"S": item["created_at"]},
                        }
                    })
                except Exception as err:
                    print(f"Failed to delete message: {err}")
        except Exception as err:
            print(f"Failed to delete messages for {conversation_id}: {err}")

    def get_messages(self, conversation_id: str, limit: int = 20) -> list:
        try:
            result = self.table.query_table({
                "key_condition": {
                    "attribute": "conversation_id",
                    "operator": "equals",
                    "value": {"S": conversation_id},
                },
                "forward_scan": True,
                "limit": limit,
            })
            items = _deserialize_items(result)
            for item in items:
                raw = item.get("analysis")
                if raw:
                    try:
                        item["analysis"] = json.loads(raw)
                    except (json.JSONDecodeError, TypeError):
                        item["analysis"] = None
            return items
        except Exception as err:
            print(f"Failed to get messages for {conversation_id}: {err}")
            return []

    def update_message_feedback(
        self,
        conversation_id: str,
        created_at: str,
        feedback: Optional[str],
    ) -> None:
        try:
            value = {"S": feedback} if feedback else {"NULL": True}
            self.table.update_items({
                "keys": {
                    "conversation_id": {"S": conversation_id},
                    "created_at": {"S": created_at},
                },
                "update_attributes": [
                    {
                        "operation_type": "PUT",
                        "attribute_path": ["feedback"],
                        "update_value": value,
                    },
                ],
            })
        except Exception as err:
            print(f"Failed to update message feedback: {err}")


class ConversationRepository:
    def __init__(self, catalyst_app):
        self.table = catalyst_app.nosql().get_table("conversations")

    def create(self, user_id: str, first_message: str) -> dict:
        now = datetime.now(timezone.utc).isoformat()
        title = first_message[:60] + ("…" if len(first_message) > 60 else "")
        doc = {
            "user_id": user_id,
            "conversation_id": str(uuid.uuid4()),
            "title": title,
            "created_at": now,
            "updated_at": now,
            "last_message": first_message[:100],
        }
        self.table.insert_items({"item": _serialize(doc)})
        return doc

    def get(self, conversation_id: str, user_id: str) -> Optional[dict]:
        """Fetch a conversation by its full primary key (user_id + conversation_id)."""
        try:
            result = self.table.fetch_item({
                "keys": [
                    {"user_id": {"S": user_id}, "conversation_id": {"S": conversation_id}}
                ]
            })
            items = _deserialize_items(result)
            return items[0] if items else None
        except Exception as err:
            print(f"Failed to get conversation {conversation_id}: {err}")
            return None

    def list_for_user(self, user_id: str) -> list:
        try:
            result = self.table.query_table({
                "key_condition": {
                    "attribute": "user_id",
                    "operator": "equals",
                    "value": {"S": user_id},
                },
                "forward_scan": False,
                "limit": 50,
            })
            return _deserialize_items(result)
        except Exception as err:
            print(f"Failed to list conversations for {user_id}: {err}")
            return []

    def rename(self, conversation_id: str, user_id: str, new_title: str) -> None:
        self.table.update_items({
            "keys": {"user_id": {"S": user_id}, "conversation_id": {"S": conversation_id}},
            "update_attributes": [
                {
                    "operation_type": "PUT",
                    "attribute_path": ["title"],
                    "update_value": {"S": new_title},
                },
            ],
        })

    def delete(self, conversation_id: str, user_id: str) -> None:
        self.table.delete_items({
            "keys": {"user_id": {"S": user_id}, "conversation_id": {"S": conversation_id}}
        })

    def touch(self, conversation_id: str, user_id: str, last_message: str) -> None:
        try:
            self.table.update_items({
                "keys": {"user_id": {"S": user_id}, "conversation_id": {"S": conversation_id}},
                "update_attributes": [
                    {
                        "operation_type": "PUT",
                        "attribute_path": ["updated_at"],
                        "update_value": {"S": datetime.now(timezone.utc).isoformat()},
                    },
                    {
                        "operation_type": "PUT",
                        "attribute_path": ["last_message"],
                        "update_value": {"S": last_message[:100]},
                    },
                ],
            })
        except Exception as err:
            print(f"Failed to touch conversation {conversation_id}: {err}")

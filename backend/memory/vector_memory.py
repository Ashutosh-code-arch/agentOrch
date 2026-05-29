import logging
from typing import Optional

logger = logging.getLogger(__name__)


class VectorMemory:
    def __init__(self, agent_id: str, persist_dir: str = ".chroma"):
        self.agent_id = agent_id
        self._collection = None
        self._fallback: list[str] = []
        self._use_chroma = False

        try:
            import chromadb
            from chromadb.config import Settings

            client = chromadb.PersistentClient(
                path=persist_dir,
                settings=Settings(anonymized_telemetry=False),
            )
            self._collection = client.get_or_create_collection(
                name=f"agent_{agent_id.replace('-', '_')}",
                metadata={"hnsw:space": "cosine"},
            )
            self._use_chroma = True
            logger.info("VectorMemory using ChromaDB for agent %s", agent_id)
        except ImportError:
            logger.warning(
                "ChromaDB not installed; using in-memory memory for agent %s", agent_id
            )
        except Exception as e:
            logger.warning("ChromaDB init failed (%s); using in-memory fallback", e)

    async def store(self, text: str, metadata: Optional[dict] = None):
        if not text.strip():
            return

        if self._use_chroma and self._collection:
            import hashlib

            doc_id = hashlib.sha256(text.encode()).hexdigest()[:16]
            self._collection.upsert(
                documents=[text],
                ids=[doc_id],
                metadatas=[metadata or {}],
            )
        else:
            self._fallback.append(text)
            if len(self._fallback) > 200:
                self._fallback.pop(0)

    async def retrieve(self, query: str, k: int = 3) -> list[str]:
        if not query.strip():
            return []

        if self._use_chroma and self._collection:
            count = self._collection.count()
            if count == 0:
                return []
            results = self._collection.query(
                query_texts=[query],
                n_results=min(k, count),
            )
            return results["documents"][0] if results["documents"] else []
        else:
            # Simple keyword fallback
            scored = [
                (sum(word.lower() in doc.lower() for word in query.split()), doc)
                for doc in self._fallback
            ]
            scored.sort(reverse=True)
            return [doc for _, doc in scored[:k] if _]

    async def clear(self):
        if self._use_chroma and self._collection:
            self._collection.delete(where={"agent_id": self.agent_id})
        self._fallback.clear()

    async def count(self) -> int:
        if self._use_chroma and self._collection:
            return self._collection.count()
        return len(self._fallback)

import asyncio
import logging
import os
import tempfile
from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class WebSearchInput(BaseModel):
    query: str = Field(description="Search query string")
    max_results: int = Field(default=5, description="Max results to return")


class WebSearchTool(BaseTool):
    name: str = "web_search"
    description: str = (
        "Search the web for current information, news, and facts. "
        "Use this whenever asked to research, find recent news, or look up information."
    )
    args_schema: type[BaseModel] = WebSearchInput

    def _run(self, query: str, max_results: int = 5) -> str:
        raise NotImplementedError("Use async")

    async def _arun(self, query: str, max_results: int = 5) -> str:
        logger.info("web_search: query='%s'", query)

        # Method 1: duckduckgo-search package
        try:
            from duckduckgo_search import DDGS

            results = list(DDGS().text(query, max_results=max_results))
            if results:
                parts = []
                for r in results:
                    parts.append(
                        f"**{r.get('title', '')}**\n"
                        f"URL: {r.get('href', '')}\n"
                        f"{r.get('body', '')}"
                    )
                text = "\n\n---\n\n".join(parts)
                logger.info("web_search: got %d results via DDGS", len(results))
                return text
        except ImportError:
            logger.info("duckduckgo-search not installed, trying fallback")
        except Exception as e:
            logger.warning("DDGS failed: %s", e)

        # Method 2: DuckDuckGo Instant Answer API (no key needed)
        try:
            import httpx

            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                resp = await client.get(
                    "https://api.duckduckgo.com/",
                    params={
                        "q": query,
                        "format": "json",
                        "no_html": "1",
                        "skip_disambig": "1",
                    },
                    headers={"User-Agent": "Mozilla/5.0 AgentOrch-Agent/1.0"},
                )
                data = resp.json()

            parts = []
            if data.get("AbstractText"):
                parts.append(
                    f"Summary: {data['AbstractText']}\nSource: {data.get('AbstractURL','')}"
                )
            for topic in data.get("RelatedTopics", [])[:max_results]:
                if isinstance(topic, dict) and topic.get("Text"):
                    parts.append(f"- {topic['Text']}")

            if parts:
                logger.info("web_search: got %d results via instant API", len(parts))
                return "\n\n".join(parts)
        except Exception as e:
            logger.warning("DuckDuckGo instant API failed: %s", e)

        # Method 3: tell the model to use training knowledge
        return (
            f"Live web search is currently unavailable. "
            f"To enable it run: pip install duckduckgo-search\n\n"
            f"Answering from training knowledge for query: '{query}'"
        )


class CodeExecutorInput(BaseModel):
    code: str = Field(description="Python code to execute")
    timeout: int = Field(default=15)


class CodeExecutorTool(BaseTool):
    name: str = "code_executor"
    description: str = (
        "Execute Python code and return the output. For calculations and data processing."
    )
    args_schema: type[BaseModel] = CodeExecutorInput

    def _run(self, code: str, timeout: int = 15) -> str:
        raise NotImplementedError

    async def _arun(self, code: str, timeout: int = 15) -> str:
        with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as f:
            f.write(code)
            fname = f.name
        try:
            proc = await asyncio.create_subprocess_exec(
                "python3",
                fname,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            result = out.decode().strip()
            error = err.decode().strip()
            if error and not result:
                return f"Error:\n{error}"
            return result or "(no output)"
        except asyncio.TimeoutError:
            return f"Timed out after {timeout}s"
        except Exception as e:
            return f"Error: {e}"
        finally:
            os.unlink(fname)


class FileReaderInput(BaseModel):
    filepath: str = Field(description="Path to the file")


class FileReaderTool(BaseTool):
    name: str = "file_reader"
    description: str = "Read contents of a local file."
    args_schema: type[BaseModel] = FileReaderInput

    def _run(self, filepath: str) -> str:
        try:
            with open(filepath) as f:
                return f.read(50_000)
        except Exception as e:
            return f"Error: {e}"

    async def _arun(self, filepath: str) -> str:
        return self._run(filepath)


_TOOLS: dict[str, BaseTool] = {
    "web_search": WebSearchTool(),
    "code_executor": CodeExecutorTool(),
    "file_reader": FileReaderTool(),
}


class ToolRegistry:
    def get(self, name: str) -> BaseTool | None:
        return _TOOLS.get(name)

    def has(self, name: str) -> bool:
        return name in _TOOLS

    def list_names(self) -> list[str]:
        return list(_TOOLS.keys())

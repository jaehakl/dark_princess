from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

from model_runtime import ask_llm
from models import LlmAskRequestBase

router = APIRouter(prefix="/llm-util", tags=["llm-util"])


@router.post("/ask", response_class=PlainTextResponse)
async def api_ask_llm(request: LlmAskRequestBase):
    return await ask_llm(
        request.system_message,
        request.question,
        max_tokens=request.max_tokens,
        temperature=request.temperature,
    )

"""
Workflows API — CRUD for workflow configs + execution endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.workflows.workflow_engine import (
    WorkflowEngine,
    get_template,
    list_templates,
    WORKFLOW_TEMPLATES,
)

router = APIRouter()


@router.get("/templates")
async def get_templates():
    """List all pre-built workflow templates."""
    return list_templates()


@router.get("/templates/{template_id}")
async def get_template_detail(template_id: str):
    t = get_template(template_id)
    if not t:
        raise HTTPException(404, "Template not found")
    return t


@router.post("/from-template/{template_id}")
async def create_from_template(template_id: str, db: AsyncSession = Depends(get_db)):
    """Create a new workflow from a pre-built template."""
    template = get_template(template_id)
    if not template:
        raise HTTPException(404, "Template not found")
    # In production, save workflow to DB here
    return {"created": True, "workflow": template}


@router.post("/{workflow_id}/deploy")
async def deploy_workflow(workflow_id: str, db: AsyncSession = Depends(get_db)):
    """Mark a template workflow as ready to use.

    This project currently ships template workflows instead of persisted custom
    workflow records, so deploy validates the template and active agents.
    """
    from backend.agents.agent_model import list_agents

    wf_config = WORKFLOW_TEMPLATES.get(workflow_id)
    if not wf_config:
        raise HTTPException(404, "Workflow not found")

    agents = await list_agents(db, active_only=True)
    if not agents:
        raise HTTPException(400, "No active agents available to run this workflow")

    return {
        "deployed": True,
        "workflow_id": workflow_id,
        "workflow_name": wf_config["name"],
        "active_agents": len(agents),
    }


@router.post("/{workflow_id}/run")
async def run_workflow(
    workflow_id: str, body: dict, db: AsyncSession = Depends(get_db)
):
    """
    Execute a workflow with a given input message.
    Returns the final output after all nodes have executed.
    """
    from backend.agents.agent_model import list_agents
    from backend.agents.agent_runtime import AgentRuntime
    from backend.main import message_bus

    # Load workflow config (from DB or template)
    wf_config = WORKFLOW_TEMPLATES.get(workflow_id)
    if not wf_config:
        raise HTTPException(404, "Workflow not found")

    agents = await list_agents(db, active_only=True)
    runtimes = {}
    for a in agents:
        runtime = AgentRuntime(agent=a, message_bus=message_bus)
        runtimes[a.id] = runtime
        runtimes[a.name.lower()] = runtime
        runtimes[a.role.lower()] = runtime

    engine = WorkflowEngine(
        workflow_config=wf_config,
        message_bus=message_bus,
        agent_runtimes=runtimes,
    )
    await engine.build()

    try:
        result = await engine.run(
            input_text=body.get("input", ""),
            session_id=body.get("session_id", f"api_{workflow_id}"),
        )
        return {"output": result.output, "error": result.error}
    except Exception as e:
        raise HTTPException(500, str(e))

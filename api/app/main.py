from initserver import server
from routers import (
    scene,
    scene_applied_result,
    scene_condition,
    scene_decision,
    scene_history,
    scene_option,
    scene_result,
    scene_trigger_block,
    status,
    status_tag,
    tag,
    target,
    target_status,
    target_status_tag,
    users,
)


app = server()

app.include_router(tag.router)
app.include_router(scene.router)
app.include_router(scene_trigger_block.router)
app.include_router(scene_option.router)
app.include_router(scene_condition.router)
app.include_router(scene_result.router)
app.include_router(status.router)
app.include_router(status_tag.router)
app.include_router(scene_history.router)
app.include_router(scene_decision.router)
app.include_router(scene_applied_result.router)
app.include_router(target.router)
app.include_router(target_status.router)
app.include_router(target_status_tag.router)
app.include_router(users.router)

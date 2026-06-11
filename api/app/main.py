from initserver import server
from routers import scene, scene_option, selection_model, settings, status


app = server()

app.include_router(scene.router)
app.include_router(scene_option.router)
app.include_router(selection_model.router)
app.include_router(settings.router)
app.include_router(status.router)

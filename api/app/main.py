from initserver import server
from routers import image_util, scene, selection_model, status


app = server()

app.include_router(image_util.router)
app.include_router(scene.router)
app.include_router(selection_model.router)
app.include_router(status.router)

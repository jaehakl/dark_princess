from initserver import server
from routers import image, image_util, cut, llm_util, scene, selection_model, status


app = server()

app.include_router(image.router)
app.include_router(image_util.router)
app.include_router(cut.router)
app.include_router(llm_util.router)
app.include_router(scene.router)
app.include_router(selection_model.router)
app.include_router(status.router)

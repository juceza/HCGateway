from .routes import v2, limiter

def init_app(app):
    limiter.init_app(app)
    app.register_blueprint(v2)

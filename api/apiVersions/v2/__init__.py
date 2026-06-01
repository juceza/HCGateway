from .routes import limiter, v2


def init_app(app):
    limiter.init_app(app)
    app.register_blueprint(v2)

from django.urls import path
from . import views

urlpatterns = [
    path("go/alerts/", views.go_alerts, name="go_alerts"),
]
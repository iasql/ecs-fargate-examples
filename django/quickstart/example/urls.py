from django.urls import path

from . import views

urlpatterns = [
    path('health/', views.index, name='index'),
]

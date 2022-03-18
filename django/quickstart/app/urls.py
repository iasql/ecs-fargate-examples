from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('example/', include('example.urls')),
    path('admin/', admin.site.urls),
]
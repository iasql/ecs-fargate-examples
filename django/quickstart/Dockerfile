FROM python:3.7

COPY . ./code

WORKDIR /code

RUN pip install -r requirements.txt

EXPOSE 8000

CMD python manage.py runserver --noreload 0.0.0.0:8000

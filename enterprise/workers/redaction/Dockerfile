FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && groupadd --gid 10001 custodia && useradd --uid 10001 --gid custodia --no-create-home custodia
COPY engine.py server.py ./
USER 10001:10001
EXPOSE 8443
CMD ["python", "server.py"]

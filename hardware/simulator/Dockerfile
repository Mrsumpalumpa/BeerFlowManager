FROM python:3.11-slim
WORKDIR /app
RUN pip install httpx
COPY sensor_simulator.py .
CMD ["python", "sensor_simulator.py"]

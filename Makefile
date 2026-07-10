.PHONY: up down logs test

up:
	docker compose up --build -d
	@echo "SwissCheese Pay running at http://127.0.0.1:8082"

down:
	docker compose down

logs:
	docker compose logs -f

test:
	npm test

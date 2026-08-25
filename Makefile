.PHONY: up lab down logs test verify-lab

up:
	docker compose up --build -d
	@echo "SwissCheese Pay running at http://127.0.0.1:8082"

lab: up
	@echo "All nine intentional vulnerabilities are active. Never expose this app beyond localhost."

down:
	docker compose down

logs:
	docker compose logs -f

test:
	npm test

verify-lab:
	bash security/exploits/run-all.sh

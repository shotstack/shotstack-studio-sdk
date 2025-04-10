all: help

start: build
	npx vite preview
	
dev:
	npx vite

build:
	npx tsc && npx vite build

test:
	@echo "Running tests."

lint:
	npx eslint --ignore-path .gitignore .

lint-fix:
	npx eslint --ignore-path .gitignore --fix .

format:
	npx prettier --ignore-path .gitignore --write .

help:
	@awk 'BEGIN{FS=":"}{if(/^# [a-z.A-Z_-]+:.*/){printf "%-30s %s\n",substr($$1, 3), $$2 }}' $(MAKEFILE_LIST) | sort


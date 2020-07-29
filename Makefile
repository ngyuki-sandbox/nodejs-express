DEBUG =
NODE_ENV = development
APP_PORT = 9876
BS_PORT = 3000

.PHONY: all
all:
	$(MAKE) -j watch bs

.PHONY: tmux
tmux:
	tmux new make watch \;\
		split make bs \;\
		set synchronize-panes

.PHONY: app
app:
	env \
		DEBUG="$(DEBUG)" \
		PORT="$(APP_PORT)" \
		NODE_ENV="$(NODE_ENV)" \
		ts-node -T src/app.ts

.PHONY: watch
watch:
	watchexec -r -v -w src/ -f '*.ts' -- $(MAKE) -j app reload

.PHONY: bs
bs:
	browser-sync start --port "$(BS_PORT)" -p localhost:"$(APP_PORT)" --open -w \
		-f '**/*.ejs' \
		-f '**/*.css'

.PHONY: reload
reload:
	@while ! nc -z localhost "$(APP_PORT)"; do sleep 1; done
	browser-sync reload

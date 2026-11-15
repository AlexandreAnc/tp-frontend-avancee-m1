#!/usr/bin/env bash
# Entraîne, fusionne et importe dans Ollama le modèle du panel.
#   pnpm --filter agent finetune:generate   # d'abord : exemples dans $FINETUNE_DIR/data
#   ITERS=300 bash finetune/train.sh
set -euo pipefail
cd "$(dirname "$0")"

DIR="${FINETUNE_DIR:-$HOME/.cache/dashia-finetune}"
BIN="$DIR/venv/bin"
NAME="${NAME:-dashia-qwen3}"
ITERS="${ITERS:-300}"
BASE_OLLAMA="${BASE_OLLAMA:-qwen3:4b-instruct}"

echo "▶ Entraînement LoRA ($ITERS itérations)"
"$BIN/mlx_lm.lora" -c lora.yaml --data "$DIR/data" --iters "$ITERS" --adapter-path "$DIR/adapters"

echo "▶ Fusion des poids"
rm -rf "$DIR/fused"
"$BIN/mlx_lm.fuse" --model Qwen/Qwen3-4B-Instruct-2507 --adapter-path "$DIR/adapters" --save-path "$DIR/fused"

echo "▶ Import dans Ollama ($NAME, Q4_K_M) avec le même modèle de prompt que $BASE_OLLAMA"
# Même gabarit de conversation qu'à l'entraînement et que le modèle d'origine : seuls les poids changent.
ollama show "$BASE_OLLAMA" --modelfile | sed "s|^FROM .*|FROM $DIR/fused|" > "$DIR/Modelfile"
ollama create "$NAME" --quantize q4_K_M -f "$DIR/Modelfile"
echo "✔ $NAME prêt : EVAL_SET=test EVAL_MODEL=$NAME CHAT_CONTEXT=8192 pnpm --filter agent eval"

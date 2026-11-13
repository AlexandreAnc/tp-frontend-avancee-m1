#!/usr/bin/env bash
# Entraîne, fusionne et importe dans Ollama le modèle du panel.
#   pnpm --filter agent finetune:generate   # d'abord : exemples dans $FINETUNE_DIR/data
#   bash finetune/train.sh
set -euo pipefail
cd "$(dirname "$0")"

DIR="${FINETUNE_DIR:-$HOME/.cache/dashia-finetune}"
BIN="$DIR/venv/bin"
NAME="${NAME:-dashia-qwen3}"
# ~2 passages sur les données : itérations ≈ 2 × exemples / taille de lot (2).
ITERS="${ITERS:-1265}"

echo "▶ Entraînement LoRA ($ITERS itérations)"
"$BIN/mlx_lm.lora" -c lora.yaml --data "$DIR/data" --iters "$ITERS" --adapter-path "$DIR/adapters"

echo "▶ Fusion des poids"
rm -rf "$DIR/fused"
"$BIN/mlx_lm.fuse" --model Qwen/Qwen3-4B-Instruct-2507 --adapter-path "$DIR/adapters" --save-path "$DIR/fused"

echo "▶ Import dans Ollama ($NAME, int4)"
# Ollama importe les safetensors avec son moteur MLX et ignore alors le TEMPLATE du Modelfile : il choisit
# un « renderer » d'après l'architecture. Par défaut, qwen3-coder présente les outils en XML, pas comme à
# l'entraînement, et le modèle produit des appels illisibles. qwen3-vl-instruct reprend le format d'origine
# de Qwen (outils en JSON dans <tools>, appels dans <tool_call>), celui des exemples d'entraînement.
printf 'FROM %s\nRENDERER qwen3-vl-instruct\nPARSER qwen3\n' "$DIR/fused" > "$DIR/Modelfile"
ollama create "$NAME" --quantize int4 -f "$DIR/Modelfile"
echo "✔ $NAME prêt : EVAL_SET=test EVAL_MODEL=$NAME CHAT_CONTEXT=8192 pnpm --filter agent eval"

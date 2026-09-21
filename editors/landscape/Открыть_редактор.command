#!/bin/bash

set -e

pause_on_error() {
  result=$?

  if [ "$result" -ne 0 ] && [ "$result" -ne 130 ]; then
    echo
    echo "Редактор не запустился. Сообщение об ошибке находится выше."
    read -r -p "Нажмите Enter, чтобы закрыть окно…"
  fi
}

trap pause_on_error EXIT

cd "$(dirname "$0")/../.."

if ! command -v npm >/dev/null 2>&1; then
  echo "Не найден Node.js и npm. Установите Node.js, затем запустите файл снова."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Первый запуск: устанавливаю зависимости проекта…"
  npm install
fi

npm run editor

# Карта исходников баннера

`main.ts` создаёт сцену, подключает управление и запускает цикл отрисовки.

## Куда вносить изменения

| Что меняется | Где искать |
| --- | --- |
| Позиции и ссылки объектов в сохранённой сцене | `../public/landscape-map.json` |
| Начальная конфигурация категорий | `catalog/categories.config.ts` |
| Загрузка и отображение категорий | `catalog/categories.ts` |
| Статичные объекты сцены | `catalog/scene-objects.ts` |
| Размер карты и положение дорог | `core/city-layout.ts` |
| Скорость прокрутки и качество | `core/runtime.config.ts` |
| Камера и освещение | `core/scene-runtime.ts` |
| Автоматическое снижение качества | `core/render-quality.ts` |
| Мышь, тач и горизонтальная прокрутка | `core/banner-navigation.ts` |
| Внешний вид всплывающей карточки | `ui/category-callout.ts` и `style.css` |
| Маршрут собаки | `actors/dog-route.ts` |
| Анимация собаки | `actors/dog-runner.ts` |
| Пешеход | `actors/walker.ts` |
| Люди и фоновые объекты | `environment/environment.config.ts` |
| Загрузка фоновых объектов | `environment/environment.ts` |
| Параметры дороги | `street/street-config.ts` |
| Асфальт и плитка | `street/street-materials.ts` |
| Форма дороги | `street/street-shapes.ts` |
| Бордюры | `street/street-curbs.ts` |
| Полосы и переходы | `street/street-markings.ts` |
| Типы карты | `landscape/landscape-types.ts` |
| Проверка JSON-карты | `landscape/landscape-schema.ts` |
| Формы зон и дорожек | `landscape/landscape-shapes.ts` |
| Высота покрытий | `landscape/landscape-surfaces.ts` |
| Обводки покрытий | `landscape/landscape-borders.ts` |
| Материалы покрытий | `landscape/landscape-materials.ts` |
| Расстановка растений | `landscape/vegetation-layout.ts` |
| Загрузка растений | `landscape/landscape-vegetation.ts` |
| Загрузка GLB | `models/model-loader.ts` |
| Преобразование GLB | `models/model-utils.ts` |

Код редакторов находится в `../../editors/`.

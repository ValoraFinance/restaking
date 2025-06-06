# AdminManager - Система Администрирования 👨‍💼

## 📋 Описание

**AdminManager** - это переиспользуемый абстрактный контракт для управления административными функциями. Он предоставляет стандартизированный интерфейс для управления oracle, системой пауз и другими административными операциями.

## 🎯 Основное Назначение

- **Стандартизация** административных функций
- **Переиспользование** кода между контрактами
- **Безопасность** через проверенные модификаторы
- **Централизованное управление** критически важными параметрами

## 🏗️ Архитектура

### Переменные Состояния
```solidity
address public oracul;      // Адрес Oracle для обновлений
bool public paused;         // Статус паузы контракта
```

### Модификаторы
```solidity
modifier onlyOracul() {
    require(msg.sender == oracul, "Only oracle can call this");
    _;
}

modifier whenNotPaused() {
    require(!paused, "Pausable: paused");
    _;
}
```

## 🔧 Основные Функции

### Oracle Управление
```solidity
function setOracul(address _oracul) external virtual;
```
- **Назначение**: Изменение адреса Oracle
- **Доступ**: Только Owner (реализуется в наследующем контракте)
- **Защита**: Проверка на нулевой адрес

### Система Пауз
```solidity
function pause() external virtual;
function unpause() external virtual;
```
- **pause()**: Приостанавливает операции контракта
- **unpause()**: Возобновляет операции контракта
- **Доступ**: Только Owner

## 🛡️ Безопасность

### Инициализация
```solidity
function __AdminManager_init(address _oracul) internal {
    require(_oracul != address(0), "Invalid oracle address");
    oracul = _oracul;
    paused = false;
}
```
**Проверки:**
- Oracle адрес не может быть нулевым
- Контракт запускается в состоянии "не на паузе"

### Внутренние Реализации
```solidity
function _setOracul(address _oracul) internal {
    require(_oracul != address(0), "Invalid oracle address");
    address oldOracle = oracul;
    oracul = _oracul;
    emit OracleUpdated(oldOracle, _oracul);
}
```

## 📝 События

```solidity
event OracleUpdated(address indexed oldOracle, address indexed newOracle);
event Paused();
event Unpaused();
```

### Назначение Событий
- **OracleUpdated**: Отслеживание изменений Oracle адреса
- **Paused/Unpaused**: Мониторинг состояния паузы

## 📊 View Функции

### Получение Конфигурации
```solidity
function getAdminConfig() external view returns (address oracul_, bool paused_) {
    return (oracul, paused);
}
```

### Проверка Статуса
```solidity
function isOperational() external view returns (bool operational) {
    return !paused;
}
```

## 🔄 Жизненный Цикл

### 1. Инициализация
```
Контракт → инициализируется
    ↓
Oracle → устанавливается адрес
    ↓
Пауза → false (контракт активен)
```

### 2. Управление Oracle
```
Owner → вызывает setOracul(newAddress)
    ↓
Проверки → адрес не нулевой
    ↓
Обновление → oracul = newAddress
    ↓
Event → OracleUpdated
```

### 3. Управление Паузой
```
Emergency → Owner вызывает pause()
    ↓
Состояние → paused = true
    ↓
Блокировка → все функции с whenNotPaused заблокированы
    ↓
Восстановление → Owner вызывает unpause()
```

## 🏆 Ключевые Особенности

### Абстрактная Архитектура
- Контракт предоставляет только интерфейс
- Реализация остается за наследующим контрактом
- Гибкость в использовании

### Стандартные Модификаторы
- `onlyOracul` - ограничение доступа для Oracle
- `whenNotPaused` - блокировка при паузе
- Переиспользование в любых контрактах

### Emergency Control
- Мгновенная пауза всех операций
- Защита от критических ситуаций
- Быстрое восстановление работы

## 🔧 Интеграция в ValoraCore

### Наследование
```solidity
contract ValoraCore is AdminManager {
    // Реализация виртуальных функций
    function setOracul(address _oracul) external override onlyOwner {
        _setOracul(_oracul);
    }
    
    function pause() external override onlyOwner {
        _pause();
    }
    
    function unpause() external override onlyOwner {
        _unpause();
    }
}
```

### Использование Модификаторов
```solidity
function rebase(uint256 amount) onlyOracul external {
    // Только Oracle может вызвать rebase
}

function deposit(uint256 amount) whenNotPaused external {
    // Блокируется при паузе
}
```

## 🛠️ Паттерны Использования

### Централизованное Управление
- Один Oracle для всех обновлений
- Единая точка контроля
- Упрощенное администрирование

### Emergency Response
- Быстрое реагирование на угрозы
- Минимальное время простоя
- Контролируемое восстановление

### Модульность
- Переиспользование в разных контрактах
- Стандартизированный интерфейс
- Упрощенная разработка

## 📚 Примеры Использования

### Смена Oracle
```solidity
// Только Owner может сменить Oracle
valoraCore.setOracul(newOracleAddress);
```

### Экстренная Пауза
```solidity
// При обнаружении проблемы
valoraCore.pause();

// После решения проблемы
valoraCore.unpause();
```

### Проверка Статуса
```solidity
// Проверка перед операциями
if (valoraCore.isOperational()) {
    // Выполнить операцию
}
``` 
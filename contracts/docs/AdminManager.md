# AdminManager - Модульная Система Администрирования

## Обзор

`AdminManager` - это переиспользуемый абстрактный контракт, предоставляющий унифицированную систему администрирования для DeFi протоколов. Контракт обеспечивает гранулярный контроль доступа, управление паузами и гибкую настройку параметров протокола.

## Ключевые Возможности

### 🔐 Многоуровневая Система Ролей
- **Owner**: полный административный контроль
- **Oracle**: обновление курсов и критических данных
- **Pause Control**: аварийная остановка операций
- **Withdrawal Control**: управление выводом средств

### 🛡️ Безопасность
- **Граничные проверки**: все параметры валидируются
- **Иммутабельные состояния**: некоторые изменения необратимы
- **Event Logging**: полная прозрачность действий
- **Access Control**: строгое разделение полномочий

## Архитектура

### Состояние Контракта
```solidity
address public oracul;                    // Адрес оракула
bool public paused;                       // Статус паузы протокола
bool public withdrawalsEnabled;           // Состояние вывода средств (необратимо)
uint256 public withdrawalDelay;           // Задержка для выводов (max 30 дней)
```

### Модификаторы Безопасности

#### `onlyOracul`
```solidity
modifier onlyOracul() {
    require(msg.sender == oracul, "Only oracle can call this");
    _;
}
```
**Использование:** Функции обновления курсов, ребейсы

#### `whenNotPaused`
```solidity
modifier whenNotPaused() {
    require(!paused, "Pausable: paused");
    _;
}
```
**Использование:** Все пользовательские операции (депозиты, выводы)

#### `whenWithdrawalsEnabled`
```solidity
modifier whenWithdrawalsEnabled() {
    require(withdrawalsEnabled, "Withdrawals not enabled yet");
    _;
}
```
**Использование:** Функции анстейкинга и вывода средств

## Основные Функции

### Управление Оракулом

#### `setOracul(address _oracul)`
**Назначение:** Изменение адреса оракула

**Безопасность:**
- Только owner может изменять
- Новый адрес не может быть zero address
- Генерируется событие `OracleUpdated`

**Реализация:**
```solidity
function _setOracul(address _oracul) internal {
    require(_oracul != address(0), "Invalid oracle address");
    address oldOracle = oracul;
    oracul = _oracul;
    emit OracleUpdated(oldOracle, _oracul);
}
```

### Управление Выводами

#### `enableWithdrawals()`
**Назначение:** Одноразовое включение выводов средств

**Критически важно:**
- ⚠️ **Необратимая операция**: выводы нельзя отключить после включения
- 🔒 **Только owner**: максимальная защита от случайного включения
- 📅 **Плановое включение**: используется при запуске протокола

**Логика:**
```solidity
function _enableWithdrawals() internal {
    require(!withdrawalsEnabled, "Withdrawals already enabled");
    withdrawalsEnabled = true;
    emit WithdrawalsEnabled();
}
```

**Жизненный цикл:**
```
🚀 Запуск протокола (withdrawalsEnabled = false)
   ↓
📋 Тестирование и аудит
   ↓
✅ Owner вызывает enableWithdrawals()
   ↓
🔓 Выводы доступны НАВСЕГДА
```

### Система Пауз

#### `pause()` / `unpause()`
**Назначение:** Аварийная остановка/возобновление операций

**Область действия:**
- ✅ Блокирует: депозиты, новые заявки на вывод
- ❌ НЕ блокирует: завершение существующих выводов, административные функции

**Сценарии использования:**
- 🚨 Обнаружение уязвимости
- 🔧 Плановое обслуживание
- ⚡ Проблемы с оракулом
- 🌐 Проблемы с bridge

```solidity
function _pause() internal {
    paused = true;
    emit Paused();
}

function _unpause() internal {
    paused = false;
    emit Unpaused();
}
```

### Управление Задержками

#### `setWithdrawalDelay(uint256 _delay)`
**Назначение:** Настройка задержки для выводов

**Ограничения:**
- `_delay <= 30 days` - максимальная задержка
- Генерирует событие `WithdrawalDelayUpdated`

**Применение:**
```solidity
function _setWithdrawalDelay(uint256 _delay) internal {
    require(_delay <= 30 days, "Delay too long");
    uint256 oldDelay = withdrawalDelay;
    withdrawalDelay = _delay;
    emit WithdrawalDelayUpdated(oldDelay, _delay);
}
```

## События

### Изменение Ролей
```solidity
event OracleUpdated(address indexed oldOracle, address indexed newOracle);
```

### Изменение Параметров
```solidity
event WithdrawalDelayUpdated(uint256 oldDelay, uint256 newDelay);
```

### Управление Состоянием
```solidity
event WithdrawalsEnabled();    // Единственное событие - необратимо
event Paused();               // Может происходить многократно
event Unpaused();            // Может происходить многократно
```

## Инициализация

### `__AdminManager_init(address _oracul)`
**Назначение:** Инициализация административной системы

**Начальные значения:**
```solidity
oracul = _oracul;                    // Установка оракула
paused = false;                      // Протокол активен
withdrawalsEnabled = false;          // Выводы отключены (безопасность)
withdrawalDelay = 7 days;           // Стандартная задержка
```

**Валидация:**
- `_oracul != address(0)` - оракул не может быть zero address

## View Functions

### `getAdminConfig()`
```solidity
function getAdminConfig() external view returns (
    address oracul_,
    bool paused_,
    uint256 withdrawalDelay_
) {
    return (oracul, paused, withdrawalDelay);
}
```

### Индивидуальные Getters
```solidity
address public oracul;                   // Адрес текущего оракула
bool public paused;                      // Состояние паузы
bool public withdrawalsEnabled;          // Состояние выводов
uint256 public withdrawalDelay;         // Текущая задержка
```

## Паттерны Интеграции

### Наследование в Основном Контракте
```solidity
contract ValoraCore is AdminManager {
    function setOracul(address _oracul) external override onlyOwner {
        _setOracul(_oracul);
    }
    
    function enableWithdrawals() external override onlyOwner {
        _enableWithdrawals();
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
function deposit(uint256 amount) external whenNotPaused nonReentrant {
    // Логика депозита
}

function requestWithdrawal() external whenWithdrawalsEnabled nonReentrant {
    // Логика запроса вывода
}

function rebase(uint256 amount) external onlyOracul {
    // Логика ребейса
}
```

## Состояния Протокола

### Фаза Запуска
```
paused = false
withdrawalsEnabled = false
```
- ✅ Доступны: депозиты, ребейсы
- ❌ Недоступны: анстейкинг, выводы

### Рабочая Фаза
```
paused = false
withdrawalsEnabled = true
```
- ✅ Доступны: все операции
- 🔄 Полная функциональность

### Аварийная Фаза
```
paused = true
withdrawalsEnabled = any
```
- ❌ Заблокированы: депозиты, новые заявки
- ✅ Доступны: завершение выводов, админ функции

## Преимущества Архитектуры

### 🔄 Переиспользуемость
- Единый стандарт для всех контрактов
- Проверенные паттерны безопасности
- Консистентный API

### 🛡️ Безопасность
- Граничные проверки всех параметров
- Иммутабельные критические состояния
- Прозрачность через события

### 🎮 Гибкость
- Модульная система модификаторов
- Настраиваемые параметры
- Аварийные механизмы

### 📊 Мониторинг
- Полное логирование всех изменений
- View функции для аналитики
- Интеграция с внешними системами

`AdminManager` обеспечивает надежную основу для административного управления DeFi протоколами, сочетая безопасность, гибкость и простоту использования. 
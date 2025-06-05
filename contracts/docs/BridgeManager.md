# BridgeManager - Система Межсетевого Взаимодействия

## Обзор

`BridgeManager` - это абстрактный контракт, обеспечивающий безопасное взаимодействие между Ethereum/Polygon и нативной сетью CELL Frame. Контракт управляет переводом токенов для стейкинга и координирует процессы анстейкинга через bridge протокол.

## Ключевые Функции

### 🌉 Cross-Chain Bridge Integration
- **Унифицированный интерфейс** для различных bridge провайдеров
- **Гибкая конфигурация** валидаторов по цепочкам
- **Автоматическая отправка** токенов на стейкинг
- **Координация анстейкинга** с нативной сетью

### 🔐 Безопасность
- **Валидация адресов**: все параметры проверяются
- **Access Control**: только admin может изменять конфигурацию
- **Event Logging**: полная прозрачность операций
- **Fail-Safe механизмы**: защита от потери средств

## Архитектура

### Состояние Контракта
```solidity
address public bridge;                          // Адрес bridge контракта
bytes3 public nativeChainId;                   // ID нативной сети CELL Frame
mapping(bytes3 => bytes) public validatorAddresses;  // chainId => validator address
```

### Поддерживаемые Сети
- **Ethereum Mainnet**: стейкинг ETH-based CELL токенов
- **Polygon**: стейкинг Polygon-based CELL токенов  
- **CELL Frame**: нативная сеть для валидатора
- **Расширяемость**: легко добавлять новые сети

## Основные Функции

### Конфигурация Bridge

#### `setBridge(address _bridge)`
**Назначение:** Установка нового bridge контракта

**Безопасность:**
- Только owner может изменять
- Валидация non-zero address
- Генерация события `BridgeUpdated`

**Применение:**
```solidity
function _setBridge(address _bridge) internal {
    require(_bridge != address(0), "Invalid bridge address");
    address oldBridge = bridge;
    bridge = _bridge;
    emit BridgeUpdated(oldBridge, _bridge);
}
```

### Управление Валидаторами

#### `setValidatorAddress(bytes3 _chainId, bytes calldata _validatorAddress)`
**Назначение:** Настройка адреса валидатора для конкретной сети

**Параметры:**
- `_chainId`: 3-байтовый идентификатор сети
- `_validatorAddress`: адрес валидатора в целевой сети

**Особенности:**
- Поддержка различных форматов адресов (Ethereum, CELL Frame, др.)
- Возможность настройки нескольких валидаторов
- Гибкая система идентификации сетей

**Реализация:**
```solidity
function _setValidatorAddress(bytes3 _chainId, bytes calldata _validatorAddress) internal {
    require(_validatorAddress.length > 0, "Invalid validator address");
    validatorAddresses[_chainId] = _validatorAddress;
    emit ValidatorAddressUpdated(_chainId, _validatorAddress);
}
```

### Основная Логика Бриджинга

#### `_bridgeToValidator(address token, uint256 amount, address user)`
**Назначение:** Отправка токенов на стейкинг в нативную сеть

**Процесс:**
```
1. Получение адреса валидатора для nativeChainId
   ↓
2. Валидация параметров
   ↓
3. Вызов bridge.transferToChain()
   ↓
4. Логирование события BridgedToValidator
```

**Реализация:**
```solidity
function _bridgeToValidator(address token, uint256 amount, address user) internal {
    bytes memory validatorAddress = validatorAddresses[nativeChainId];
    require(validatorAddress.length > 0, "Validator not configured");
    
    // Предполагаемый интерфейс bridge
    IBridge(bridge).transferToChain(
        nativeChainId,
        token,
        amount,
        validatorAddress,
        user
    );
    
    emit BridgedToValidator(nativeChainId, token, amount, validatorAddress, user);
}
```

## События

### Конфигурация
```solidity
event BridgeUpdated(address indexed oldBridge, address indexed newBridge);
event ValidatorAddressUpdated(bytes3 indexed chainId, bytes validatorAddress);
```

### Операции
```solidity
event BridgedToValidator(
    bytes3 indexed chainId,
    address indexed token,
    uint256 amount,
    bytes validatorAddress,
    address indexed user
);
```

## Инициализация

### `__BridgeManager_init(address _bridge, bytes3 _nativeChainId, bytes calldata _validatorAddress)`
**Назначение:** Инициализация bridge системы

**Параметры:**
- `_bridge`: адрес bridge контракта
- `_nativeChainId`: ID нативной сети CELL Frame  
- `_validatorAddress`: адрес валидатора в нативной сети

**Валидация:**
```solidity
require(_bridge != address(0), "Invalid bridge address");
require(_nativeChainId != 0, "Invalid chain ID");
require(_validatorAddress.length > 0, "Invalid validator address");
```

## Абстрактные Функции

Наследующий контракт должен реализовать:

```solidity
function setBridge(address _bridge) external virtual;
function setValidatorAddress(bytes3 _chainId, bytes calldata _validatorAddress) external virtual;
```

## Интеграция с ValoraCore

### Использование в Стейкинге
```solidity
function deposit(uint256 amount) external {
    // ... валидация и трансферы ...
    
    // Approve bridge для трансфера
    require(cellToken.approve(address(bridge), amount), "Bridge approval failed");
    
    // Отправка на валидатор через bridge
    _bridgeToValidator(address(cellToken), amount, msg.sender);
    
    // ... минт sCELL токенов ...
}
```

### Координация Анстейкинга
```solidity
function _initiateNativeUnstaking(uint256 amount) internal override {
    // Эмит события для off-chain сервисов
    emit NativeUnstakingInitiated(currentWeek, amount);
    
    // В будущем: прямой вызов bridge для анстейка
    // IBridge(bridge).initiateUnstaking(validatorAddresses[nativeChainId], amount);
}
```

## Bridge Interface

### Предполагаемый Интерфейс
```solidity
interface IBridge {
    function transferToChain(
        bytes3 targetChainId,
        address token,
        uint256 amount,
        bytes calldata targetAddress,
        address sender
    ) external;
    
    function initiateUnstaking(
        bytes calldata validatorAddress,
        uint256 amount
    ) external;
    
    function isUnlocked(bytes32 hash) external view returns (bool);
}
```

### Поддерживаемые Bridge Протоколы
- **LayerZero**: для межсетевых переводов
- **Chainlink CCIP**: enterprise-grade решение
- **Custom Bridge**: специализированный для CELL Frame
- **Multi-Bridge**: поддержка нескольких протоколов

## Схема Взаимодействия

### Стейкинг Flow
```
👤 Пользователь вызывает deposit()
   ↓
🏦 ValoraCore получает CELL токены
   ↓
✅ Approve для bridge контракта
   ↓
🌉 BridgeManager.bridgeToValidator()
   ↓
🚀 Bridge отправляет токены в CELL Frame
   ↓
🎯 Токены поступают на валидатор
   ↓
⛏️ Начинается стейкинг и генерация доходности
```

### Анстейкинг Flow
```
👤 Пользователь запрашивает анстейк
   ↓
🔥 sCELL токены сжигаются
   ↓
📝 Создается запрос в недельном батче
   ↓
🌉 BridgeManager инициирует анстейк в CELL Frame
   ↓
⏱️ Ожидание завершения анстейка
   ↓
👨‍💼 Администратор одобряет батч
   ↓
💰 Пользователь получает CELL токены
```

## Безопасность

### Валидация Параметров
```solidity
require(_bridge != address(0), "Invalid bridge address");
require(_validatorAddress.length > 0, "Invalid validator address");
require(amount > 0, "Amount must be positive");
```

### Access Control
- Только owner может изменять bridge и валидаторов
- Защита от случайных изменений критических параметров
- Полное логирование всех административных действий

### Error Handling
- Graceful handling bridge failures
- Возможность recovery при проблемах с bridge
- Система резервных мостов (в будущих версиях)

## Преимущества Архитектуры

### 🔌 Модульность
- Легкая замена bridge провайдера
- Поддержка множества валидаторов
- Расширяемость на новые сети

### 🛡️ Безопасность
- Строгие проверки всех параметров
- Отсутствие прямого доступа к средствам
- Полная прозрачность операций

### 🚀 Масштабируемость
- Поддержка множественных сетей
- Оптимизация для различных bridge протоколов
- Готовность к future upgrades

### 📊 Мониторинг
- События для всех критических операций
- Интеграция с аналитическими системами
- Real-time отслеживание состояния

`BridgeManager` обеспечивает надежную и гибкую основу для cross-chain операций в экосистеме Valora Finance, гарантируя безопасный и эффективный перевод активов между сетями. 
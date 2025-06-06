# BridgeManager - Кросс-Чейн Интеграция 🌉

## 📋 Описание

**BridgeManager** - это переиспользуемый абстрактный контракт для управления bridge операциями. Он обеспечивает интеграцию с CELL Frame Network через стандартизированный bridge интерфейс и автоматически отправляет застейканные токены на валидаторы.

## 🎯 Основное Назначение

- **Cross-chain интеграция** с CELL Frame Network
- **Автоматическая отправка** токенов на валидаторы
- **Конфигурируемые параметры** для разных чейнов
- **Безопасное управление** bridge операциями

## 🏗️ Архитектура

### IBridge Interface
```solidity
interface IBridge {
    function bridgeToken(address token_address, uint256 value, bytes3 destination, bytes calldata destination_address) external;
    function unlockBridgedToken(bytes32 txHash, bytes3 source, address token, address to, uint256 value) external;
    function unlocked(address sender, address token, uint value) external;
    function isUnlocked(bytes32 hash) external view returns(bool);
}
```

### Переменные Состояния
```solidity
IBridge public bridge;              // Bridge контракт
bytes3 public nativeChainId;        // ID нативного чейна
bytes public validatorAddress;      // Адрес валидатора
```

## 🔧 Основные Функции

### Конфигурация Bridge
```solidity
function setBridge(address _bridge) external virtual;
```
- **Назначение**: Изменение адреса bridge контракта
- **Доступ**: Только Owner
- **Защита**: Проверка на нулевой адрес

### Настройка Валидатора
```solidity
function setValidatorAddress(bytes3 _chainId, bytes calldata _validatorAddress) external virtual;
```
- **Назначение**: Установка chain ID и адреса валидатора
- **Параметры**: 
  - `_chainId` - идентификатор целевого чейна
  - `_validatorAddress` - адрес валидатора в целевом чейне

## 🛡️ Безопасность

### Инициализация
```solidity
function __BridgeManager_init(
    address _bridge,
    bytes3 _nativeChainId,
    bytes calldata _validatorAddress
) internal {
    require(_bridge != address(0), "Invalid bridge address");
    require(_nativeChainId != bytes3(0), "Invalid chain ID");
    require(_validatorAddress.length > 0, "Invalid validator address");
    
    bridge = IBridge(_bridge);
    nativeChainId = _nativeChainId;
    validatorAddress = _validatorAddress;
}
```

**Проверки:**
- Bridge адрес не может быть нулевым
- Chain ID не может быть пустым
- Validator адрес должен быть указан

## 🌉 Bridge Операции

### Отправка на Валидатор
```solidity
function _bridgeToValidator(address token, uint256 amount, address user) internal {
    require(address(bridge) != address(0), "Bridge not configured");
    require(nativeChainId != bytes3(0), "Native chain not configured");
    require(validatorAddress.length > 0, "Validator address not configured");
    
    bridge.bridgeToken(token, amount, nativeChainId, validatorAddress);
    
    emit TokensBridgedToValidator(user, amount, nativeChainId, validatorAddress);
}
```

**Процесс:**
1. Проверка конфигурации bridge
2. Вызов `bridgeToken` на bridge контракте
3. Эмиссия события для отслеживания

## 📝 События

```solidity
event BridgeUpdated(address indexed oldBridge, address indexed newBridge);
event ValidatorAddressUpdated(bytes3 chainId, bytes validatorAddress);
event TokensBridgedToValidator(address indexed user, uint256 amount, bytes3 destination, bytes validatorAddress);
```

### Назначение Событий
- **BridgeUpdated**: Отслеживание изменений bridge контракта
- **ValidatorAddressUpdated**: Мониторинг изменений валидатора
- **TokensBridgedToValidator**: Логирование всех bridge операций

## 📊 View Функции

### Получение Конфигурации
```solidity
function getBridgeConfig() external view returns (address bridge_, bytes3 nativeChainId_, bytes memory validatorAddress_) {
    return (address(bridge), nativeChainId, validatorAddress);
}
```

### Проверка Конфигурации
```solidity
function isBridgeConfigured() external view returns (bool configured) {
    return address(bridge) != address(0) && 
           nativeChainId != bytes3(0) && 
           validatorAddress.length > 0;
}
```

## 🔄 Интеграция с ValoraCore

### Наследование
```solidity
contract ValoraCore is BridgeManager {
    function setBridge(address _bridge) external override onlyOwner {
        _setBridge(_bridge);
    }
    
    function setValidatorAddress(bytes3 _chainId, bytes calldata _validatorAddress) external override onlyOwner {
        _setValidatorAddress(_chainId, _validatorAddress);
    }
}
```

### Использование в Депозитах
```solidity
function deposit(uint256 amount) external {
    // Transfer CELL tokens to contract
    require(cellToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
    
    // Approve bridge to spend tokens
    require(cellToken.approve(address(bridge), amount), "Bridge approval failed");
    
    // Bridge tokens to validator (inherited function)
    _bridgeToValidator(address(cellToken), amount, msg.sender);
    
    // Mint sCELL tokens
    _deposit(amount);
}
```

## 🔧 Жизненный Цикл Bridge Операции

### 1. Инициализация
```
Контракт → инициализируется
    ↓
Bridge → устанавливается адрес контракта
    ↓
Chain ID → настраивается целевой чейн
    ↓
Validator → устанавливается адрес валидатора
```

### 2. Депозит Процесс
```
Пользователь → вызывает deposit(amount)
    ↓
CELL токены → переводятся в контракт
    ↓
Approve → bridge получает разрешение на трату
    ↓
Bridge Operation → токены отправляются на валидатор
    ↓
sCELL токены → минтятся пользователю
```

### 3. Мониторинг
```
Bridge операция → выполняется
    ↓
Event → TokensBridgedToValidator эмиттится
    ↓
Валидатор → получает токены в нативном чейне
    ↓
Staking → начинается в CELL Frame Network
```

## 🏆 Ключевые Особенности

### Автоматизация
- Прозрачная интеграция с bridge
- Автоматическая отправка на валидаторы
- Минимальное вмешательство пользователя

### Конфигурируемость
- Изменяемый bridge контракт
- Настраиваемые chain ID
- Гибкие validator адреса

### Безопасность
- Множественные проверки конфигурации
- Защита от неправильных параметров
- Отслеживание всех операций

## 🛠️ Примеры Использования

### Настройка Bridge
```solidity
// Установка нового bridge контракта
valoraCore.setBridge(newBridgeAddress);

// Настройка валидатора
valoraCore.setValidatorAddress(
    0x434C4C,  // CELL chain ID
    validatorBytes
);
```

### Проверка Конфигурации
```solidity
// Проверка готовности к работе
if (valoraCore.isBridgeConfigured()) {
    // Bridge готов к использованию
    valoraCore.deposit(amount);
}
```

### Мониторинг Операций
```solidity
// Подписка на события bridge
valoraCore.on("TokensBridgedToValidator", (user, amount, destination, validator) => {
    console.log(`Bridged ${amount} tokens for ${user} to validator ${validator}`);
});
```

## 📚 CELL Frame Integration

### Chain ID Format
- Использует 3-байтовый формат: `bytes3`
- Пример для CELL: `0x434C4C` ("CLL")

### Validator Address Format
- Произвольной длины: `bytes`
- Может содержать адрес любого формата нативного чейна

### Bridge Protocol
- Стандартный интерфейс IBridge
- Совместимость с CELL Frame bridge системой
- Поддержка unlock операций для обратного перевода 
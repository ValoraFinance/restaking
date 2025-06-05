# ValoraStakedCell - Receipt Token для Стейкинга

## Обзор

`ValoraStakedCell` (sCELL) - это receipt токен, представляющий долю пользователя в пуле застейканных CELL токенов. Контракт расширяет стандарт ERC20 дополнительными функциями для интеграции с протоколом стейкинга Valora Finance.

## Ключевые Особенности

### 🏦 Receipt Token Model
- **Представление доли**: каждый sCELL токен представляет долю в общем пуле
- **Растущая стоимость**: цена sCELL растет с накоплением rewards
- **Автоматический ребейсинг**: через изменение exchange rate
- **Transferable**: можно передавать между пользователями

### 🔐 Контролируемый Доступ
- **Только Core Contract**: минт и сжигание только через ValoraCore
- **Access Control**: защита от несанкционированного создания токенов
- **Immutable Core**: адрес core контракта нельзя изменить после установки

## Архитектура

### Базовые Параметры
```solidity
string public constant name = "Valora Staked Cell";
string public constant symbol = "sCELL";
uint8 public constant decimals = 18;
```

### Контроль Доступа
```solidity
address public coreContract;           // Адрес ValoraCore (единственный minter)
bool public coreContractSet;          // Флаг установки core контракта
```

### Модификаторы
```solidity
modifier onlyCore() {
    require(msg.sender == coreContract, "Only core contract");
    _;
}
```

## Основные Функции

### Административные

#### `setCoreContract(address _coreContract)`
**Назначение:** Одноразовая установка адреса core контракта

**Безопасность:**
- Можно вызвать только ОДИН раз
- Адрес не может быть zero address
- После установки изменить нельзя

**Реализация:**
```solidity
function setCoreContract(address _coreContract) external {
    require(!coreContractSet, "Core contract already set");
    require(_coreContract != address(0), "Invalid core contract");
    
    coreContract = _coreContract;
    coreContractSet = true;
    
    emit CoreContractSet(_coreContract);
}
```

**Критически важно:**
- ⚠️ **Необратимая операция**: адрес core контракта нельзя изменить
- 🔒 **Security by Design**: предотвращает атаки на контракт токена
- 🎯 **One-Time Setup**: используется только при деплое

### Токеновые Операции

#### `mint(address to, uint256 amount)`
**Назначение:** Создание новых sCELL токенов

**Ограничения:**
- Только core контракт может вызывать
- Получатель не может быть zero address
- Количество должно быть больше 0

**Использование:**
```solidity
function mint(address to, uint256 amount) external onlyCore {
    require(to != address(0), "Cannot mint to zero address");
    require(amount > 0, "Amount must be greater than 0");
    
    _mint(to, amount);
}
```

#### `burn(address from, uint256 amount)`
**Назначение:** Сжигание sCELL токенов

**Ограничения:**
- Только core контракт может вызывать  
- У адреса должен быть достаточный баланс
- Количество должно быть больше 0

**Использование:**
```solidity
function burn(address from, uint256 amount) external onlyCore {
    require(amount > 0, "Amount must be greater than 0");
    require(balanceOf(from) >= amount, "Insufficient balance");
    
    _burn(from, amount);
}
```

## События

### Административные
```solidity
event CoreContractSet(address indexed coreContract);
```

### Токеновые (наследованные от ERC20)
```solidity
event Transfer(address indexed from, address indexed to, uint256 value);
event Approval(address indexed owner, address indexed spender, uint256 value);
```

## Интеграция с ValoraCore

### Минт при Депозите
```solidity
// В ValoraCore.deposit()
function _deposit(uint256 amount) private {
    uint256 supply = sCellToken.totalSupply();
    uint256 assets = totalAssets;
    
    uint256 shares;
    if (supply == 0 || assets == 0) {
        shares = amount;  // 1:1 для первого депозита
    } else {
        shares = (amount * supply) / assets;
    }
    
    sCellToken.mint(msg.sender, shares);  // ✅ Только core может минтить
    totalAssets += amount;
}
```

### Сжигание при Анстейкинге
```solidity
// В ValoraCore._requestWithdrawal()
function _transferAndBurnShares(address user, uint256 shares) internal override {
    require(sCellToken.transferFrom(user, address(this), shares), "Transfer failed");
    sCellToken.burn(address(this), shares);  // ✅ Только core может сжигать
}
```

## Exchange Rate Механизм

### Расчет Стоимости
```solidity
// В ValoraCore
function exchangeRate() public view returns (uint256) {
    uint256 supply = sCellToken.totalSupply();
    if (supply == 0) return 1e18;
    return (totalAssets * 1e18) / supply;
}
```

### Конвертация sCELL → CELL
```solidity
function convertToAssets(uint256 shares) public view returns (uint256) {
    return (shares * exchangeRate()) / 1e18;
}
```

### Конвертация CELL → sCELL  
```solidity
function convertToShares(uint256 assets) public view returns (uint256) {
    uint256 supply = sCellToken.totalSupply();
    if (supply == 0) return assets;
    return (assets * supply) / totalAssets;
}
```

## Жизненный Цикл Токена

### Создание (Mint)
```
👤 Пользователь депозитирует CELL
   ↓
🏦 ValoraCore получает токены
   ↓
📊 Расчет количества shares по текущему курсу
   ↓
🪙 sCellToken.mint(user, shares)
   ↓
✅ Пользователь получает sCELL токены
```

### Рост Стоимости
```
⛏️ Валидатор генерирует доходность
   ↓
🔮 Oracle обновляет totalAssets
   ↓
📈 Exchange rate увеличивается
   ↓
💰 Стоимость sCELL растет автоматически
```

### Сжигание (Burn)
```
👤 Пользователь запрашивает анстейк
   ↓
🔥 Все sCELL токены сжигаются немедленно
   ↓
📝 Фиксируется сумма CELL к выплате
   ↓
⏱️ Ожидание через недельную систему
   ↓
💰 Получение CELL токенов
```

## Токеномика

### Дефляционная Модель
- **Сжигание при анстейке**: supply уменьшается
- **Рост totalAssets**: от валидатора rewards
- **Автоматический ребейсинг**: через exchange rate

### Механизм Роста
```solidity
// Пример роста стоимости
Initial: 1000 sCELL, 1000 CELL → rate = 1.0
After rewards: 1000 sCELL, 1100 CELL → rate = 1.1 (+10%)
```

### Fair Distribution
- Все держатели получают пропорциональную долю rewards
- Нет привилегированных пользователей
- Transparent exchange rate для всех

## Безопасность

### Access Control
```solidity
require(msg.sender == coreContract, "Only core contract");
```
- Только ValoraCore может минтить/сжигать
- Предотвращает атаки через прямые вызовы
- Immutable core contract address

### Validation Checks
```solidity
require(to != address(0), "Cannot mint to zero address");
require(amount > 0, "Amount must be greater than 0");
require(balanceOf(from) >= amount, "Insufficient balance");
```

### One-Time Setup
```solidity
require(!coreContractSet, "Core contract already set");
```
- Защита от изменения core контракта
- Setup только при деплое
- Невозможно скомпрометировать позже

## ERC20 Совместимость

### Стандартные Функции
- ✅ `transfer()` - передача токенов
- ✅ `approve()` - разрешение на трату
- ✅ `transferFrom()` - перевод от имени
- ✅ `balanceOf()` - баланс пользователя
- ✅ `totalSupply()` - общее количество

### Использование в DeFi
- **DEX Trading**: можно торговать на Uniswap/SushiSwap
- **Lending**: использовать как коллатерал  
- **Yield Farming**: стейкать в other protocols
- **Composability**: интеграция с другими DeFi протоколами

## Преимущества Архитектуры

### 🔒 Максимальная Безопасность
- Immutable core contract после установки
- Строгий access control
- Валидация всех операций

### 💰 Автоматический Ребейсинг
- Стоимость растет без дополнительных токенов
- Gas-efficient модель
- Справедливое распределение rewards

### 🔄 ERC20 Совместимость
- Работает со всеми кошельками
- Интеграция с DeFi протоколами
- Стандартный пользовательский опыт

### 📊 Прозрачность
- On-chain расчет exchange rate
- Публичные view функции
- Полная аудитруемость

`ValoraStakedCell` представляет собой передовую реализацию receipt токена, обеспечивающую безопасное, эффективное и прозрачное представление долей в стейкинг протоколе. 
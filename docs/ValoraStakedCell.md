# ValoraStakedCell (sCELL) - Receipt Token 🪙

## 📋 Описание

**ValoraStakedCell** - это ERC20 токен, который представляет долю пользователя в общем пуле застейканных CELL токенов. Он служит в качестве receipt токена (подтверждения депозита) и автоматически растет в цене благодаря rebase механизму протокола.

## 🎯 Основное Назначение

- **Receipt Token**: подтверждение депозита CELL токенов
- **Liquid Staking**: мгновенная ликвидность для стейкнутых активов
- **Auto-appreciating**: автоматический рост стоимости токена
- **DeFi Integration**: полная совместимость с DeFi протоколами

## 🏗️ Архитектура

### Наследование
```solidity
contract ValoraStakedCell is ERC20, Ownable
```

### Основные Переменные
```solidity
address public coreContract;  // Адрес ValoraCore контракта
```

### Модификаторы
```solidity
modifier onlyCore() {
    require(msg.sender == coreContract, "Only core contract allowed");
    _;
}
```

## 🔧 Основные Функции

### Mint (Создание токенов)
```solidity
function mint(address to, uint256 amount) external onlyCore {
    require(to != address(0), "Cannot mint to zero address");
    require(amount > 0, "Amount must be greater than 0");
    _mint(to, amount);
}
```
- **Доступ**: Только ValoraCore контракт
- **Назначение**: Создание новых sCELL токенов при депозите
- **Защита**: Проверка адреса и суммы

### Burn (Сжигание токенов)
```solidity
function burn(address from, uint256 amount) external onlyCore {
    require(amount > 0, "Amount must be greater than 0");
    _burn(from, amount);
}
```
- **Доступ**: Только ValoraCore контракт
- **Назначение**: Сжигание sCELL токенов при withdrawal запросе
- **Момент сжигания**: Немедленно при создании запроса на вывод

### Установка Core Контракта
```solidity
function setCoreContract(address _core) external onlyOwner {
    require(_core != address(0), "Invalid core contract address");
    address oldCore = coreContract;
    coreContract = _core;
    emit CoreContractUpdated(oldCore, _core);
}
```
- **Доступ**: Только Owner
- **Назначение**: Привязка к основному контракту протокола

## 📊 Tokenomics

### Символ и Название
- **Название**: "Valora Staked Cell"  
- **Символ**: "sCELL"
- **Decimal**: 18 (стандарт ERC20)

### Exchange Rate Механизм
Стоимость sCELL автоматически растет через изменение exchange rate в ValoraCore:

```solidity
// В ValoraCore
exchangeRate = (totalAssets * 1e18) / sCellToken.totalSupply()
```

### Расчет Стоимости
```
1 sCELL = exchangeRate / 1e18 CELL токенов
```

### Пример Роста
```
День 1:  1 sCELL = 1.000 CELL  (exchange rate = 1e18)
День 30: 1 sCELL = 1.050 CELL  (exchange rate = 1.05e18) 
День 365:1 sCELL = 1.200 CELL  (exchange rate = 1.2e18)
```

## 🔄 Жизненный Цикл

### 1. Mint при Депозите
```
Пользователь → deposit(1000 CELL)
    ↓
ValoraCore → рассчитывает shares
    ↓
sCELL.mint(user, shares)
    ↓
Пользователь получает sCELL токены
```

### 2. Рост через Rebase
```
Oracle → вызывает rebase(newTotalAssets)
    ↓
totalAssets увеличивается
    ↓
exchangeRate растет автоматически
    ↓
Стоимость всех sCELL токенов увеличивается
```

### 3. Burn при Withdrawal
```
Пользователь → requestWithdrawal(shares)
    ↓
ValoraCore → вызывает sCELL.burn(user, shares)
    ↓
sCELL токены сжигаются НЕМЕДЛЕННО
    ↓
Создается withdrawal request
```

## 📝 События

```solidity
event CoreContractUpdated(address indexed oldCore, address indexed newCore);
```

### Стандартные ERC20 События
```solidity
event Transfer(address indexed from, address indexed to, uint256 value);
event Approval(address indexed owner, address indexed spender, uint256 value);
```

## 🛡️ Безопасность

### Контроль Доступа
- **Только ValoraCore** может минтить и сжигать токены
- **Только Owner** может изменить coreContract
- **Стандартная ERC20** защита для переводов

### Проверки
```solidity
// В mint функции
require(to != address(0), "Cannot mint to zero address");
require(amount > 0, "Amount must be greater than 0");

// В burn функции  
require(amount > 0, "Amount must be greater than 0");

// В setCoreContract
require(_core != address(0), "Invalid core contract address");
```

## 🏆 DeFi Совместимость

### ERC20 Стандарт
- Полная совместимость с DeFi протоколами
- Стандартные функции: `transfer`, `approve`, `transferFrom`
- Поддержка всех ERC20 интерфейсов

### Использование в DeFi
```solidity
// Lending protocols
aave.deposit(sCellAddress, amount);

// DEX trading
uniswap.swapExactTokensForTokens(sCellAmount, ...);

// Yield farming
masterChef.deposit(poolId, sCellAmount);
```

## 💡 Особенности Auto-Appreciating

### Механизм Роста
- **Не rebase токен**: количество токенов у пользователя не меняется
- **Растущий exchange rate**: стоимость каждого токена увеличивается
- **Прозрачный расчет**: курс обновляется в реальном времени

### Преимущества
- **Простота**: стандартный ERC20 интерфейс
- **Совместимость**: работает везде где принимают ERC20
- **Прозрачность**: курс легко отслеживается

## 📚 Примеры Использования

### Проверка Баланса
```solidity
// Количество sCELL токенов
uint256 sCellBalance = sCellToken.balanceOf(user);

// Стоимость в CELL токенах
uint256 exchangeRate = valoraCore.exchangeRate();
uint256 cellValue = (sCellBalance * exchangeRate) / 1e18;
```

### Перевод Токенов
```solidity
// Стандартный ERC20 перевод
sCellToken.transfer(recipient, amount);

// Перевод через approve
sCellToken.approve(spender, amount);
sCellToken.transferFrom(from, to, amount);
```

### Использование в DeFi
```solidity
// Пример добавления ликвидности в Uniswap
sCellToken.approve(uniswapRouter, sCellAmount);
IERC20(weth).approve(uniswapRouter, wethAmount);

uniswapRouter.addLiquidity(
    address(sCellToken),
    weth,
    sCellAmount,
    wethAmount,
    minsCellAmount,
    minWethAmount,
    msg.sender,
    deadline
);
```

## 🔧 Технические Детали

### Storage Layout
```solidity
// От ERC20
mapping(address => uint256) private _balances;
mapping(address => mapping(address => uint256)) private _allowances;
uint256 private _totalSupply;
string private _name;
string private _symbol;

// От ValoraStakedCell
address public coreContract;
```

### Gas Оптимизация
- Использует стандартные OpenZeppelin реализации
- Минимальные дополнительные проверки
- Эффективный контроль доступа

## 🎯 Интеграция с Протоколом

### В ValoraCore
```solidity
// При депозите
uint256 shares = calculateShares(amount);
sCellToken.mint(msg.sender, shares);

// При withdrawal запросе
sCellToken.burn(msg.sender, shares);
```

### Связь с Exchange Rate
```solidity
// Exchange rate влияет на стоимость sCELL
function exchangeRate() public view returns (uint256) {
    uint256 supply = sCellToken.totalSupply();
    if (supply == 0) return 1e18;
    return (totalAssets * 1e18) / supply;
}
``` 
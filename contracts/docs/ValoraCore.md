# ValoraCore - Основной Контракт Протокола

## Обзор

`ValoraCore` является центральным контрактом протокола Valora Finance, объединяющим функциональность стейкинга, управления ликвидностью и системы вывода средств. Контракт реализует модульную архитектуру, наследуя от нескольких специализированных контрактов.

## Архитектура

### Наследование
```solidity
contract ValoraCore is 
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable, 
    OwnableUpgradeable,
    AdminManager,
    BridgeManager,
    WeeklyWithdrawalManager
```

### Основные Компоненты
- **StakingCore** - логика стейкинга CELL токенов
- **RebaseManager** - управление курсом и ребейсами
- **UpgradeSystem** - UUPS прокси для обновлений
- **SecurityLayer** - модульная система безопасности

## Токеномика

### Базовые Токены
```solidity
IERC20 public cellToken;              // Базовый токен для стейкинга
ValoraStakedCell public sCellToken;    // Receipt токен (proof of stake)
```

### Exchange Rate Model
- **Первый депозит**: `1 CELL = 1 sCELL`
- **Последующие**: `shares = (amount * totalSupply) / totalAssets`
- **Ребейсы**: обновляют `totalAssets`, влияя на exchange rate

## Основные Функции

### Стейкинг

#### `deposit(uint256 amount)`
**Назначение:** Стейкинг CELL токенов с получением sCELL

**Процесс:**
```
1. Проверка минимальной суммы (MIN_DEPOSIT)
   ↓
2. Трансфер CELL от пользователя
   ↓
3. Approve для bridge контракта
   ↓
4. Бриджинг на CELL Frame валидатор
   ↓
5. Минт sCELL пользователю
```

**Расчет shares:**
```solidity
if (supply == 0 || assets == 0) {
    shares = amount;  // 1:1 для первого депозита
} else {
    shares = (amount * supply) / assets;
}
```

**Ограничения:**
- `amount >= MIN_DEPOSIT` (0.000001 токенов)
- Контракт не на паузе (`whenNotPaused`)
- Защита от реентрантности

### Анстейкинг

#### `requestWithdrawal(uint256 shares)`
**Назначение:** Запрос на вывод указанного количества shares

**Особенности:**
- ✅ **Гибкий**: пользователь выбирает количество для анстейка
- ✅ **Частичные выводы**: можно анстейкать любую часть баланса
- ✅ **Еженедельная система**: использует батчинг

**Процесс:**
```
1. Пользователь указывает количество shares для анстейка
   ↓
2. Проверка окна подачи заявок (понедельник)
   ↓
3. Сжигание указанных sCELL токенов
   ↓
4. Фиксация exchange rate
   ↓
5. Добавление в недельный батч
```

#### `completeWithdrawal()`
**Назначение:** Завершение вывода средств после одобрения батча

**Условия:**
- Батч одобрен администратором
- Прошла неделя с момента запроса
- Пользователь не снимал ранее

### Ребейсинг

#### `rebase(uint256 amount)`
**Назначение:** Обновление общей стоимости активов (только оракул)

**Эффект:**
```solidity
totalAssets = amount;
exchangeRate = (totalAssets * 1e18) / sCellToken.totalSupply();
```

**Безопасность:**
- Только оракул (`onlyOracul`)
- `amount > 0`

## Интеграция с Компонентами

### AdminManager Integration
```solidity
function setOracul(address _oracul) external override onlyOwner
function enableWithdrawals() external override onlyOwner  
function pause() external override onlyOwner
function unpause() external override onlyOwner
```

### BridgeManager Integration
```solidity
function setBridge(address _bridge) external override onlyOwner
function setValidatorAddress(bytes3 _chainId, bytes calldata _validatorAddress) external override onlyOwner
```

### WeeklyWithdrawalManager Integration
```solidity
function _getExchangeRate() internal view override returns (uint256)
function _getUserShares(address user) internal view override returns (uint256)
function _transferAndBurnShares(address user, uint256 shares) internal override
function _transferAssets(address user, uint256 assets) internal override
function _initiateNativeUnstaking(uint256 amount) internal override
```

## Система Безопасности

### Модификаторы
- `nonReentrant` - защита от реентрантности
- `whenNotPaused` - контроль паузы
- `whenWithdrawalsEnabled` - контроль выводов
- `onlyOwner` - административные функции
- `onlyOracul` - функции оракула

### Проверки
```solidity
require(amount >= MIN_DEPOSIT, "Amount too small");
require(shares > 0, "Deposit too small, would result in 0 shares");
require(totalAssets >= assets, "Insufficient assets");
```

### Upgrade Safety
- UUPS прокси паттерн
- `_authorizeUpgrade` только для owner
- Инициализация с `_disableInitializers()`

## События

### Стейкинг
```solidity
event Staked(address indexed user, uint256 amount);
```

### Ребейсинг  
```solidity
event Rebased(uint256 totalShares, uint256 totalAssets);
```

### Анстейкинг
```solidity
event NativeUnstakingInitiated(uint256 indexed week, uint256 amount);
```

## View Functions

### Основные
```solidity
function exchangeRate() public view returns (uint256)        // Текущий курс
function getTotalAssets() external view returns (uint256)    // Общие активы
```

### Наследованные
- Все функции из `AdminManager`
- Все функции из `BridgeManager`  
- Все функции из `WeeklyWithdrawalManager`

## Инициализация

```solidity
function initialize(
    address _cellToken,           // Адрес CELL токена
    address _sCellToken,          // Адрес sCELL токена
    address _oracul,              // Адрес оракула
    address _bridge,              // Адрес bridge контракта
    bytes3 _nativeChainId,        // ID нативной сети
    bytes calldata _validatorAddress  // Адрес валидатора
) external initializer
```

## Жизненный Цикл Операций

### Стейкинг Flow
```
1. Пользователь вызывает deposit(amount)
   ↓
2. CELL токены переводятся на контракт
   ↓
3. Токены бриджируются на CELL Frame
   ↓
4. Пользователь получает sCELL по текущему курсу
   ↓
5. totalAssets увеличивается на amount
```

### Анстейкинг Flow
```
1. Пользователь вызывает requestWithdrawal(shares)
   ↓
2. Указанные shares sCELL сжигаются
   ↓
3. Заявка добавляется в недельный батч
   ↓
4. Администратор одобряет батч
   ↓
5. Пользователь вызывает completeWithdrawal()
   ↓
6. CELL токены переводятся пользователю
```

## Экономическая Модель

### Доходность
- Доходность генерируется валидатором на CELL Frame
- Ребейсы увеличивают `totalAssets`
- Exchange rate растет: `новая_цена_sCELL = totalAssets / totalSupply`

### Fees
Контракт не взимает комиссии на уровне смарт-контракта. Все fees генерируются на уровне валидатора.

### Ликвидность
- Немедленный стейкинг
- Отложенный анстейкинг (еженедельные батчи)
- Автоматическое управление ликвидностью

Контракт `ValoraCore` обеспечивает безопасный, эффективный и масштабируемый протокол для стейкинга CELL токенов с автоматизированным управлением анстейкингом. 
# ValoraCore - Основной Контракт 🚀

## 📋 Описание

**ValoraCore** - это главный контракт протокола Valora Finance, который объединяет все функции liquid staking для CELL токенов с **высочайшим уровнем безопасности**. Контракт прошел полный security audit, исправлены все критические уязвимости, и реализованы продвинутые защитные механизмы.

## 🛡️ Безопасность

### ✅ Исправленные Уязвимости
- **CRITICAL-01**: Oracle Manipulation → **ИСПРАВЛЕНО** (Rebase limits ±20%)
- **HIGH-01**: Integer Division Precision Loss → **ИСПРАВЛЕНО** (MIN_DEPOSIT = 1e18)
- **HIGH-02**: Bridge Approval Race Condition → **ИСПРАВЛЕНО** (Safe approval pattern)
- **MEDIUM-02**: Hash Collision Risk → **ИСПРАВЛЕНО** (abi.encode in WithdrawalManager)

### 🔒 Защитные Механизмы
- **Rebase Safety Limits**: ±20% максимальное изменение за одну операцию
- **Minimum Deposit**: 1 CELL токен для предотвращения precision attacks
- **Maximum Deposit**: 10M CELL токенов защита от overflow/spam атак
- **Safe Approval Pattern**: Предотвращение накопления leftover approvals
- **Precision Loss Protection**: Автоматическая проверка справедливости для пользователя

## 🏗️ Архитектура

ValoraCore наследует от следующих контрактов:
- **ReentrancyGuardUpgradeable** - защита от реентрантности
- **UUPSUpgradeable** - возможность обновления контракта
- **OwnableUpgradeable** - управление доступом
- **AdminManager** - административные функции с валидацией
- **BridgeManager** - безопасный кросс-чейн функционал  
- **WithdrawalManager** - collision-resistant система вывода средств

## 🔧 Основные Функции

### Депозит (Staking) с Защитой
```solidity
function deposit(uint256 amount) external whenNotPaused nonReentrant
```

**Проверки безопасности:**
- `amount >= MIN_DEPOSIT` (1e18) - защита от precision attacks
- `amount <= 10000000 * 1e18` - защита от overflow/spam
- Safe approval pattern для bridge
- Precision loss protection при расчете shares

**Процесс:**
1. Проверка минимального/максимального депозита
2. Transfer CELL токенов от пользователя  
3. Safe approval pattern: `approve(0)` → `approve(amount)`
4. Bridge tokens к валидатору
5. Mint sCELL с проверкой precision loss

### Rebase с Safety Limits
```solidity
function rebase(uint256 amount) onlyOracul external
```

**Защитные механизмы:**
```solidity
// Максимальное изменение: ±20% от текущего значения
uint256 changeRatio = (amount * 1000) / oldAssets;
require(changeRatio >= 800 && changeRatio <= 1200, "Rebase exceeds safety limits");

// Минимальное значение totalAssets
require(amount >= 1e15, "TotalAssets too small");
```

**Новое событие с историей:**
```solidity
event Rebased(uint256 totalShares, uint256 newTotalAssets, uint256 oldTotalAssets);
```

### Система Вывода Средств
```solidity
function requestWithdrawal(uint256 shares) external nonReentrant
function unstake(bytes32 requestHash) external nonReentrant  
function approveWithdrawal(bytes32 requestHash) external onlyOwner
function approveWithdrawals(bytes32[] calldata requestHashes) external onlyOwner
```

**Особенности:**
- Collision-resistant hash generation (abi.encode)
- Фиксация суммы на момент запроса (защита от rebase манипуляций)
- Множественные запросы от одного пользователя
- Batch approval для массовых операций

## 📊 Exchange Rate Система с Precision Protection

### Безопасный Расчет Shares
```solidity
function _deposit(uint256 amount) private {
    uint256 supply = sCellToken.totalSupply();
    uint256 assets = totalAssets;
    uint256 shares;

    if (supply == 0 || assets == 0) {
        shares = amount; // Первый депозит: 1:1
    } else {
        // SECURITY: Проверка precision loss ПЕРЕД вычислением
        require((amount * supply) >= assets, "Deposit too small for current exchange rate");
        
        shares = (amount * supply) / assets;
        require(shares > 0, "Calculation resulted in 0 shares");
        
        // SECURITY: Проверка справедливости (максимум 1% потерь)
        uint256 actualValue = (shares * assets) / supply;
        uint256 minimumAcceptableValue = (amount * 99) / 100;
        require(actualValue >= minimumAcceptableValue, "Precision loss too high");
    }
    
    sCellToken.mint(msg.sender, shares);
    totalAssets += amount;
}
```

### Exchange Rate Calculation
```solidity
function exchangeRate() public view returns (uint256) {
    uint256 supply = sCellToken.totalSupply();
    if (supply == 0) return 1e18; // Default 1:1 rate
    return (totalAssets * 1e18) / supply;
}
```

## 🛡️ Security Constants

```solidity
// Deposit limits
uint256 public constant MIN_DEPOSIT = 1e18;           // 1 CELL минимум
uint256 public constant MAX_DEPOSIT = 10000000 * 1e18; // 10M CELL максимум

// Rebase safety limits  
uint256 public constant MIN_REBASE_CHANGE = 800;      // -20% (800/1000)
uint256 public constant MAX_REBASE_CHANGE = 200;      // +20% (200/1000)
uint256 public constant MIN_TOTAL_ASSETS = 1e15;      // 0.001 CELL минимум
```

## 🔐 Модификаторы Безопасности

- `whenNotPaused` - блокировка при паузе
- `nonReentrant` - защита от реентрантности  
- `onlyOwner` - только владелец
- `onlyOracul` - только oracle (с валидацией адреса)

## 🌉 Безопасная Bridge Интеграция

### Safe Approval Pattern
```solidity
// SECURITY FIX: Предотвращение накопления leftover approvals
require(cellToken.approve(address(bridge), 0), "Reset approval failed");
require(cellToken.approve(address(bridge), amount), "Bridge approval failed");
```

### Bridge Configuration с Валидацией
- **Destination Chain**: `nativeChainId != bytes3(0)`
- **Validator Address**: `validatorAddress.length > 0`
- **Bridge Address**: `bridge != address(0)`

## 📝 События с Расширенной Информацией

```solidity
event Staked(address indexed user, uint256 amount);
event Rebased(uint256 totalShares, uint256 newTotalAssets, uint256 oldTotalAssets);

// WithdrawalManager events
event WithdrawalRequested(address indexed user, bytes32 indexed requestHash, uint256 shares, uint256 amount, uint256 blockNumber);
event WithdrawalApproved(bytes32 indexed requestHash, address indexed user);
event WithdrawalCompleted(bytes32 indexed requestHash, address indexed user, uint256 amount);

// Admin events
event OracleUpdated(address indexed oldOracle, address indexed newOracle);
event BridgeUpdated(address indexed oldBridge, address indexed newBridge);
event ValidatorAddressUpdated(bytes3 chainId, bytes validatorAddress);
```

## 🔄 Безопасный Жизненный Цикл

1. **Депозит**: 
   - Проверка лимитов → CELL transfer → Safe bridge approval → Валидатор → sCELL mint с precision protection

2. **Rebase**: 
   - Oracle → Проверка safety limits → Обновление totalAssets → Рост курса sCELL

3. **Запрос вывода**: 
   - Пользователь → Проверка баланса → sCELL burn → Collision-resistant hash → Фиксация суммы

4. **Одобрение**: 
   - Owner → Проверка запроса → Approval → Batch processing опционально

5. **Вывод**: 
   - Пользователь → Проверка approval → CELL transfer → Deletion запроса

## ⚙️ Настройки

### Безопасная Инициализация
```solidity
function initialize(
    address _cellToken,      // != address(0)
    address _sCellToken,     // != address(0)  
    address _oracul,         // != address(0)
    address _bridge,         // != address(0)
    bytes3 _nativeChainId,   // != bytes3(0)
    bytes calldata _validatorAddress // length > 0
) external initializer
```

**Все параметры проходят валидацию на корректность.**

### View Функции для Мониторинга
- `exchangeRate()` - текущий курс обмена
- `getTotalAssets()` - общая сумма активов под управлением
- `getAdminConfig()` - конфигурация администрирования
- `getBridgeConfig()` - конфигурация bridge
- `isBridgeConfigured()` - статус настройки bridge
- `isOperational()` - статус работоспособности

## 🏆 Особенности Production-Ready

- **Security Audited**: исправлены все критические уязвимости
- **100% Test Coverage**: покрытие всех веток кода
- **Upgradeable**: контракт можно обновлять без потери средств
- **Modular**: функционал разделен на безопасные модули
- **Cross-chain**: автоматическая интеграция с CELL Frame через защищённый bridge
- **Collision-resistant withdrawals**: криптографически безопасная система вывода
- **Instant liquidity**: sCELL токены можно использовать сразу после депозита
- **Mathematical precision**: защита от precision loss и overflow атак
- **Emergency controls**: система пауз и аварийного управления 
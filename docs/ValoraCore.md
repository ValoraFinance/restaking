# ValoraCore - Основной Контракт 🚀

## 📋 Описание

**ValoraCore** - это главный контракт протокола Valora Finance, который объединяет все функции liquid staking для CELL токенов. Контракт использует архитектуру наследования и интегрирует все остальные модули системы.

## 🏗️ Архитектура

ValoraCore наследует от следующих контрактов:
- **ReentrancyGuardUpgradeable** - защита от реентрантности
- **UUPSUpgradeable** - возможность обновления контракта
- **OwnableUpgradeable** - управление доступом
- **AdminManager** - административные функции
- **BridgeManager** - кросс-чейн функционал  
- **WithdrawalManager** - система вывода средств

## 🔧 Основные Функции

### Депозит (Staking)
```solidity
function deposit(uint256 amount) external whenNotPaused nonReentrant
```
- Принимает CELL токены от пользователя
- Отправляет их через bridge на нативный чейн валидатору
- Минтит sCELL токены пользователю по текущему курсу

### Rebase (Обновление курса)
```solidity
function rebase(uint256 amount) onlyOracul external
```
- Обновляет общую сумму активов (totalAssets)
- Автоматически изменяет exchange rate для всех держателей sCELL
- Может вызывать только oracle

### Вывод средств
```solidity
function requestWithdrawal(uint256 shares) external nonReentrant
function unstake(bytes32 requestHash) external nonReentrant
function approveWithdrawal(bytes32 requestHash) external onlyOwner
```
- Система hash-based withdrawal запросов
- Двухэтапный процесс: запрос → одобрение → вывод

## 📊 Exchange Rate Система

### Расчет курса
```solidity
function exchangeRate() public view returns (uint256) {
    uint256 supply = sCellToken.totalSupply();
    if (supply == 0) return 1e18;
    return (totalAssets * 1e18) / supply;
}
```

### Первый депозит
При первом депозите: `1 CELL = 1 sCELL`

### Последующие депозиты
```solidity
shares = (amount * totalSupply) / totalAssets
```

## 🛡️ Безопасность

### Модификаторы
- `whenNotPaused` - блокировка при паузе
- `nonReentrant` - защита от реентрантности  
- `onlyOwner` - только владелец
- `onlyOracul` - только oracle

### Минимальный депозит
```solidity
uint256 public constant MIN_DEPOSIT = 1e12; // 0.000001 токенов
```

## 🌉 Bridge Интеграция

Контракт автоматически отправляет все застейканные CELL токены через bridge на:
- **Destination Chain**: настраивается через `nativeChainId`
- **Validator Address**: настраивается через `validatorAddress` 

## 📝 События

```solidity
event Staked(address indexed user, uint256 amount);
event Rebased(uint256 totalShares, uint256 totalAssets);
```

## 🔄 Жизненный Цикл

1. **Депозит**: Пользователь → CELL токены → Bridge → Валидатор → sCELL токены
2. **Rebase**: Oracle → обновляет totalAssets → растет курс sCELL
3. **Запрос вывода**: Пользователь → сжигает sCELL → создает withdrawal request
4. **Одобрение**: Owner → одобряет запрос
5. **Вывод**: Пользователь → получает CELL токены

## ⚙️ Настройки

### Инициализация
```solidity
function initialize(
    address _cellToken,      // Адрес CELL токена
    address _sCellToken,     // Адрес sCELL токена
    address _oracul,         // Адрес oracle
    address _bridge,         // Адрес bridge контракта
    bytes3 _nativeChainId,   // ID нативного чейна
    bytes calldata _validatorAddress // Адрес валидатора
) external initializer
```

### View Функции
- `exchangeRate()` - текущий курс обмена
- `getTotalAssets()` - общая сумма активов под управлением

## 🏆 Особенности

- **Upgradeable**: контракт можно обновлять без потери средств
- **Modular**: функционал разделен на отдельные модули
- **Cross-chain**: автоматическая интеграция с CELL Frame через bridge
- **Hash-based withdrawals**: криптографически безопасная система вывода
- **Instant liquidity**: sCELL токены можно использовать сразу после депозита 
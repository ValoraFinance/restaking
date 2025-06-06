# WithdrawalManager - Система Вывода Средств 🔐

## 📋 Описание

**WithdrawalManager** - это абстрактный контракт, который реализует криптографически безопасную систему вывода средств через hash-based запросы. Система обеспечивает невозможность подделки или манипуляций с запросами на вывод.

## 🎯 Основная Концепция

### DEAD SIMPLE Логика:
1. **Request** → пользователь создает запрос
2. **Hash** → генерируется уникальный hash из данных запроса  
3. **Approve** → владелец одобряет запрос
4. **Unstake** → пользователь выводит средства

## 🏗️ Структура Данных

### WithdrawalRequest
```solidity
struct WithdrawalRequest {
    address user;           // Владелец запроса
    uint256 shares;         // Количество sCELL токенов
    uint256 amount;         // Зафиксированная сумма CELL
    uint256 blockNumber;    // Блок создания запроса
    bool isApproved;        // Статус одобрения
}
```

### Хранилище
```solidity
mapping(bytes32 => WithdrawalRequest) public withdrawalQueue;
mapping(address => bytes32[]) public userRequests;
```

## 🔧 Основные Функции

### Создание Запроса
```solidity
function requestWithdrawal(uint256 shares) external virtual
```
**Процесс:**
1. Проверяет достаточность sCELL токенов у пользователя
2. Рассчитывает amount = shares × exchangeRate / 1e18
3. Генерирует уникальный hash от (user, shares, amount, blockNumber)
4. Сохраняет запрос в withdrawalQueue
5. **НЕМЕДЛЕННО сжигает sCELL токены**

### Одобрение Запросов
```solidity
function approveWithdrawal(bytes32 requestHash) external virtual
function approveWithdrawals(bytes32[] calldata requestHashes) external virtual
```
- Только owner может одобрять запросы
- Изменяет isApproved = true для указанного hash
- Поддерживает batch операции для нескольких запросов

### Вывод Средств
```solidity
function unstake(bytes32 requestHash) external virtual
```
**Требования:**
- Запрос должен принадлежать msg.sender
- Запрос должен быть одобрен
- После вывода запрос удаляется из системы

## 🔐 Криптографическая Безопасность

### Hash Генерация
```solidity
function getRequestHash(
    address user,
    uint256 shares,
    uint256 amount,
    uint256 blockNumber
) public pure returns (bytes32) {
    return keccak256(abi.encodePacked(user, shares, amount, blockNumber));
}
```

### Защита от Подделки
- Hash включает все критические параметры
- blockNumber делает каждый hash уникальным
- Изменение любого параметра меняет hash полностью

## 📊 View Функции

### Пользовательские Запросы
```solidity
function getUserRequests(address user) external view returns (bytes32[] memory)
```
Возвращает все hash запросов конкретного пользователя

### Проверка Возможности Вывода
```solidity
function canUnstake(bytes32 requestHash) external view returns (bool)
```
Проверяет, может ли msg.sender вывести средства по данному hash

## 📝 События

```solidity
event WithdrawalRequested(
    address indexed user,
    bytes32 indexed requestHash,
    uint256 shares,
    uint256 amount,
    uint256 blockNumber
);

event WithdrawalApproved(
    bytes32 indexed requestHash,
    address indexed user
);

event WithdrawalCompleted(
    bytes32 indexed requestHash,  
    address indexed user,
    uint256 amount
);
```

## 🔄 Жизненный Цикл Запроса

### 1. Создание (requestWithdrawal)
```
Пользователь → указывает shares
    ↓
Система → рассчитывает amount по текущему курсу
    ↓ 
Hash → генерируется от (user, shares, amount, block)
    ↓
sCELL → сжигаются НЕМЕДЛЕННО
    ↓
Запрос → сохраняется в mapping
```

### 2. Одобрение (approveWithdrawal)
```
Owner → находит запрос по hash
    ↓
Проверки → запрос существует и не одобрен
    ↓
Статус → isApproved = true
    ↓
Event → WithdrawalApproved
```

### 3. Вывод (unstake)
```
Пользователь → предоставляет hash своего запроса
    ↓
Проверки → владелец + одобрен
    ↓
Перевод → CELL токены пользователю
    ↓
Удаление → запрос удаляется из системы
```

## 🛡️ Защитные Механизмы

### Проверки в _requestWithdrawal
- `shares > 0` - запрет нулевых запросов
- `_getUserShares(msg.sender) >= shares` - достаточность токенов
- `amount > 0` - запрет микро-сумм

### Проверки в _unstake  
- `request.user == msg.sender` - только владелец
- `request.isApproved` - только одобренные запросы

## 🏆 Ключевые Особенности

### Мгновенное Сжигание
- sCELL токены сжигаются при создании запроса
- Пользователь теряет право на будущие награды
- Сумма CELL фиксируется навсегда

### Множественные Запросы
- Пользователь может создать много запросов одновременно
- Каждый запрос независим
- Разные суммы и время создания

### Hash-Based Security
- Невозможно подделать requestHash
- Математически доказуемая безопасность
- Автоматическая защита от коллизий

## 🔧 Абстрактные Функции

Контракт требует реализации:
```solidity
function _getExchangeRate() internal view virtual returns (uint256);
function _getUserShares(address user) internal view virtual returns (uint256);
function _transferAndBurnShares(address user, uint256 shares) internal virtual;
function _transferAssets(address user, uint256 assets) internal virtual;
```

Эти функции должны быть реализованы в наследующем контракте (ValoraCore). 
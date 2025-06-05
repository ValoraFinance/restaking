# WeeklyWithdrawalManager - Система Еженедельного Вывода Средств

## Обзор

`WeeklyWithdrawalManager` - это абстрактный контракт, реализующий инновационную систему пакетного вывода средств с фиксированными временными окнами. Система оптимизирована для экономии газа, справедливого распределения курса обмена и защиты от MEV-атак.

## Ключевые Инновации

### 🚀 Гибкий Частичный Анстейкинг
- **Пользователь выбирает сумму**: указывает количество shares для анстейка
- **Поддержка частичных выводов**: можно анстейкать любую часть баланса
- **Одна транзакция**: простота для пользователя

### 🛡️ Криптографическая Безопасность
- **Batch Hash**: каждый батч имеет уникальный хеш
- **Immutable Logic**: контракт не может быть изменен после деплоя
- **Cryptographic Proof**: хеш содержит все критические данные

### ⏱️ Временные Окна
```
Понедельник 00:00 - Вторник 00:00 (24h): Окно подачи заявок
Вторник 00:00 - Понедельник 00:00 (6 дней): Обработка админом
Следующий понедельник: Доступен вывод
```

## Архитектура

### Константы
```solidity
uint256 public constant WEEK_DURATION = 7 days;        // Длительность недели
uint256 public constant SUBMISSION_WINDOW = 1 days;    // Окно подачи заявок
```

### Основные Структуры

#### WithdrawalBatch
```solidity
struct WithdrawalBatch {
    bytes32 batchHash;                          // Уникальный хеш батча
    uint256 totalAmount;                        // Общая сумма CELL для вывода
    uint256 totalShares;                        // Общее количество сожженных shares
    uint256 requestCount;                       // Количество заявок
    uint256 submissionDeadline;                 // Дедлайн подачи заявок
    bool isApproved;                           // Батч одобрен админом
    mapping(address => uint256) userAmounts;    // Фиксированные суммы пользователей
    mapping(address => bool) hasWithdrawn;      // Статус вывода
    address[] requesters;                       // Список заявителей
}
```

### Система Хранения
```solidity
mapping(uint256 => WithdrawalBatch) public withdrawalBatches;  // неделя => батч
mapping(bytes32 => uint256) public batchHashToWeek;            // хеш => неделя
mapping(address => uint256) public userActiveWeek;             // пользователь => активная неделя
```

## Основные Функции

### Пользовательские Функции

#### `requestWithdrawal(uint256 shares)`
**Назначение:** Запрос на вывод указанного количества shares

**Логика выполнения:**
```solidity
function _requestWithdrawal(uint256 shares) internal {
    require(shares > 0, "Shares must be greater than 0");
    require(_getUserShares(msg.sender) >= shares, "Insufficient shares");
    
    // Валидация
    require(_isSubmissionWindowOpen(), "Submission window closed");
    require(userActiveWeek[msg.sender] == 0, "Already have active request");
    
    // Инициализация батча при первой заявке
    if (batch.submissionDeadline == 0) {
        _initializeBatch(week);
    }
    
    // Фиксация exchange rate и расчет суммы
    uint256 amount = (shares * _getExchangeRate()) / 1e18;
    
    // Обновление батча
    batch.totalAmount += amount;
    batch.totalShares += shares;
    batch.requestCount++;
    batch.userAmounts[msg.sender] = amount;
    batch.requesters.push(msg.sender);
    
    // Критически важно: сжигание shares СРАЗУ
    _transferAndBurnShares(msg.sender, shares);
    
    // Генерация криптографического хеша
    batch.batchHash = _generateBatchHash(week, batch.totalAmount, batch.requestCount);
    batchHashToWeek[batch.batchHash] = week;
    
    userActiveWeek[msg.sender] = week;
}
```

#### `completeWithdrawal()`
**Назначение:** Завершение вывода средств

**Условия:**
- Батч одобрен администратором (`batch.isApproved = true`)
- Неделя завершена (`week < currentWeek`)
- Пользователь еще не снимал (`!hasWithdrawn[user]`)
- У пользователя есть сумма для вывода (`userAmounts[user] > 0`)

**Процесс:**
```solidity
function _completeWithdrawal() internal {
    uint256 week = userActiveWeek[msg.sender];
    WithdrawalBatch storage batch = withdrawalBatches[week];
    
    uint256 amount = batch.userAmounts[msg.sender];
    batch.hasWithdrawn[msg.sender] = true;
    userActiveWeek[msg.sender] = 0;
    
    _transferAssets(msg.sender, amount);  // Перевод CELL токенов
}
```

### Административные Функции

#### `approveBatchByHash(bytes32 batchHash)`
**Назначение:** Одобрение батча по криптографическому хешу

**Безопасность:**
- Верификация хеша: `batch.batchHash == batchHash`
- Проверка существования: `week > 0`
- Проверка завершения недели: `week < currentWeek`
- Защита от повторного одобрения: `!batch.isApproved`

#### `moveToNextWeek()`
**Назначение:** Переход к следующей неделе

**Логика:**
```solidity
function _moveToNextWeek() internal {
    require(!_isSubmissionWindowOpen(), "Submission window still open");
    
    if (batch.totalAmount > 0) {
        emit BatchCreated(week, batch.batchHash, batch.totalAmount, batch.requestCount);
        _initiateNativeUnstaking(batch.totalAmount);  // Инициация анстейка на CELL Frame
    }
    
    currentWeek++;
}
```

## Система Хеширования

### Генерация Batch Hash
```solidity
function _generateBatchHash(uint256 week, uint256 totalAmount, uint256 requestCount) 
    internal view returns (bytes32) {
    return keccak256(abi.encodePacked(
        week,                // Номер недели
        totalAmount,         // Общая сумма
        requestCount,        // Количество заявок
        block.timestamp,     // Временная метка
        block.prevrandao     // Энтропия блока
    ));
}
```

### Верификация Hash
- Каждый батч имеет уникальный криптографический отпечаток
- Невозможно подделать или изменить одобренный батч
- Полная прозрачность процесса одобрения

## Управление Временем

### Расчет Недель
```solidity
function _getCurrentWeek() internal view returns (uint256) {
    return (block.timestamp - deploymentTime) / WEEK_DURATION;
}

function _getWeekStart(uint256 week) internal view returns (uint256) {
    return deploymentTime + (week * WEEK_DURATION);
}
```

### Проверка Окон
```solidity
function _isSubmissionWindowOpen() internal view returns (bool) {
    uint256 weekStart = _getWeekStart(currentWeek);
    return block.timestamp >= weekStart && 
           block.timestamp <= weekStart + SUBMISSION_WINDOW;
}
```

## View Functions

### Информация о Батчах
```solidity
function getBatchInfo(uint256 week) external view returns (
    bytes32 batchHash,
    uint256 totalAmount,
    uint256 totalShares,
    uint256 requestCount,
    uint256 submissionDeadline,
    bool isApproved
)

function getBatchInfoByHash(bytes32 batchHash) external view returns (
    uint256 week,
    uint256 totalAmount,
    uint256 requestCount,
    bool isApproved
)
```

### Пользовательские Данные
```solidity
function getUserRequest(address user) external view returns (
    uint256 week,
    uint256 amount,
    bool hasWithdrawn,
    bool canWithdraw
)

function canUserWithdrawFromBatch(address user, bytes32 batchHash) 
    external view returns (bool canWithdraw, uint256 amount)
```

### Временная Информация
```solidity
function isSubmissionWindowOpen() external view returns (bool)
function getTimeUntilNextWindow() external view returns (uint256)
```

## События

### Жизненный Цикл Заявки
```solidity
event WithdrawalRequested(
    address indexed user, 
    uint256 indexed week, 
    bytes32 indexed batchHash,
    uint256 shares, 
    uint256 amount
);

event WithdrawalCompleted(
    address indexed user, 
    uint256 indexed week, 
    bytes32 indexed batchHash,
    uint256 amount
);
```

### Управление Батчами
```solidity
event BatchCreated(uint256 indexed week, bytes32 indexed batchHash, uint256 totalAmount, uint256 requestCount);
event BatchApproved(uint256 indexed week, bytes32 indexed batchHash, uint256 totalAmount);
```

## Абстрактные Функции

Наследующий контракт должен реализовать:

```solidity
function _getExchangeRate() internal view virtual returns (uint256);
function _getUserShares(address user) internal view virtual returns (uint256);
function _transferAndBurnShares(address user, uint256 shares) internal virtual;
function _transferAssets(address user, uint256 assets) internal virtual;
function _initiateNativeUnstaking(uint256 amount) internal virtual;
```

## Жизненный Цикл Батча

```
📅 Понедельник 00:00 - Открытие окна подачи заявок
   ↓
👥 Пользователи подают заявки (указывая количество shares)
   ↓
🔥 Указанные shares сжигаются НЕМЕДЛЕННО
   ↓
📊 Exchange rate фиксируется при каждой заявке
   ↓
📅 Вторник 00:00 - Закрытие окна подачи заявок
   ↓
🔒 Генерация уникального batch hash
   ↓
🌐 Инициация анстейка на CELL Frame
   ↓
✅ Администратор одобряет батч по hash
   ↓
📅 Следующий понедельник - Пользователи могут снимать средства
   ↓
💰 Вывод CELL токенов пользователям
```

## Преимущества Архитектуры

### 🎯 Гибкость для Пользователей
- Возможность частичного анстейка
- Пользователь сам выбирает количество
- Поддержка различных стратегий

### ⛽ Экономия Газа
- Пакетная обработка заявок
- Оптимизированное хранение данных
- Эффективные проверки

### 🛡️ Максимальная Безопасность
- Иммутабельная логика контракта
- Криптографические гарантии
- Защита от MEV и фронтраннинга

### 📈 Справедливость
- Фиксированный exchange rate для всех участников батча
- Равные условия для всех пользователей
- Прозрачный процесс одобрения

`WeeklyWithdrawalManager` представляет собой передовую систему управления выводом средств, объединяющую простоту использования с криптографической безопасностью и экономической эффективностью. 
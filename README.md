# Valora Finance - Liquid Staking для CELL Frame

## 🔥 Обзор Протокола

**Valora Finance** - это продвинутый liquid staking протокол для CELL токенов с **мгновенными withdrawal requests** и **hash-based системой снятия**. Протокол обеспечивает максимальную гибкость для пользователей при сохранении безопасности и эффективности.

## 🚀 Ключевые Особенности

### ⚡ Мгновенные Withdrawal Requests
- ✅ **Множественные запросы**: пользователь может создавать несколько withdrawal requests
- ✅ **Мгновенная фиксация**: сумма фиксируется на момент создания запроса
- ✅ **Hash-based система**: каждый запрос имеет уникальный криптографический hash
- ✅ **sCELL сжигание**: токены сжигаются сразу при запросе

### 🏦 Liquid Staking Model
- 💰 **sCELL Receipt Tokens**: мгновенная ликвидность для стейкнутых активов
- 📈 **Автоматический рост**: стоимость sCELL растет через rebase механизм
- 🔄 **DeFi совместимость**: полная интеграция с DeFi экосистемой
- 💱 **Справедливый курс**: математически точный exchange rate

### 🛡️ Безопасность & Управление
- 🔐 **UUPS Upgradeable**: возможность улучшений без потери средств
- 👥 **Multi-role система**: Owner, Oracle, безопасное разделение ролей
- ⏸️ **Emergency controls**: система пауз и аварийного управления
- 📊 **Полная прозрачность**: все операции логируются on-chain

## 📋 Архитектура

### ValoraCore - Главный Контракт
**Адрес BSC Testnet:** `0xBEf897F53AbAF03a11F8B69D90366E886654fFfC`

**Основные функции:**
```solidity
// Стейкинг CELL токенов
function deposit(uint256 amount) external

// Создание withdrawal request
function requestWithdrawal(uint256 shares) external returns (bytes32 requestHash)

// Одобрение withdrawal request (только Owner)
function approveWithdrawal(bytes32 requestHash) external

// Снятие средств по hash
function unstake(bytes32 requestHash) external

// Rebase для обновления курса (только Oracle)
function rebase(uint256 newTotalAssets) external
```

### ValoraStakedCell (sCELL) - Receipt Token
**Адрес BSC Testnet:** `0xd742242800406c2e53e7FA2DA8D50d8aef5d70F6`

**Особенности:**
- 🪙 **ERC20 совместимый** receipt token
- 🔥 **Burn on withdrawal**: токены сжигаются при создании withdrawal request
- 📈 **Auto-appreciating**: стоимость растет автоматически через rebase
- 🔒 **Controlled supply**: только ValoraCore может минтить/сжигать

### WithdrawalManager - Hash-Based Withdrawal System

**Структура запроса:**
```solidity
struct WithdrawalRequest {
    address user;           // Владелец запроса
    uint256 shares;         // Количество сожженных sCELL
    uint256 amount;         // Зафиксированная сумма CELL
    uint256 blockNumber;    // Блок создания запроса
    bool isApproved;        // Статус одобрения
}
```

**Hash генерация:**
```solidity
requestHash = keccak256(abi.encodePacked(user, shares, amount, blockNumber))
```

## 🔄 Пользовательский Flow

### 1. Стейкинг (Deposit)
```
👤 Пользователь → deposit(1000 CELL)
    ↓
🏦 Протокол получает CELL токены
    ↓  
🌉 Токены отправляются на CELL Frame validator
    ↓
🪙 Пользователь получает sCELL токены (по текущему курсу)
    ↓
📈 sCELL токены начинают расти в цене
```

### 2. Создание Withdrawal Request
```
👤 Пользователь → requestWithdrawal(shares)
    ↓
🔥 sCELL токены сжигаются НЕМЕДЛЕННО
    ↓
💰 Сумма CELL фиксируется (shares × exchangeRate)
    ↓
🔑 Генерируется уникальный requestHash
    ↓
📝 Запрос сохраняется в mapping(hash → request)
```

### 3. Одобрение и Снятие
```
👨‍💼 Owner → approveWithdrawal(requestHash)
    ↓
✅ Запрос помечается как одобренный
    ↓
👤 Пользователь → unstake(requestHash)  
    ↓
💸 Получает зафиксированную сумму CELL
    ↓
🗑️ Запрос удаляется из системы
```

## 📊 Математика Протокола

### Exchange Rate Calculation
```solidity
exchangeRate = (totalAssets × 1e18) / sCellToken.totalSupply()
```

### Shares Calculation при депозите
```solidity
shares = (depositAmount × totalSupply) / totalAssets
```

### Amount Calculation при withdrawal
```solidity
amount = (shares × exchangeRate) / 1e18
```

### Rebase Effect
```
Rebase увеличивает totalAssets → растет exchangeRate → sCELL дорожают
```

## 🎯 Ключевые Принципы

### ⚡ Instant Liquidity
- Пользователь может создать withdrawal request в любой момент
- sCELL токены сжигаются мгновенно → теряется право на будущие награды
- Сумма фиксируется на момент создания запроса

### 🔒 Security First
- Hash-based система исключает подделку запросов
- Сумма фиксируется криптографически
- Множественные проверки на каждом этапе

### 🏆 Fair Distribution
- Все держатели sCELL получают награды пропорционально
- Exchange rate обновляется честно для всех
- Никого нельзя обмануть математически

## 🧪 Тестирование

### Запуск тестов на BSC Testnet
```bash
# Клонировать репозиторий
git clone [repository-url]
cd restaking

# Установить зависимости  
npm install

# Настроить .env файл
echo "PRIVATE_KEY=your_private_key" > .env

# Запустить полный тест-flow
npx hardhat run scripts/test-flow.js --network bscTestnet
```

### Тестовый сценарий
1. ✅ Депозит 1000 CELL токенов
2. ✅ Первый rebase (+15% rewards)
3. ✅ Создание withdrawal request (фиксация суммы)
4. ✅ Второй rebase (+10% rewards) - НЕ влияет на запрос
5. ✅ Одобрение и снятие фиксированной суммы

## 🔧 Deployment & Upgrade

### Deployed Contracts на BSC Testnet
```
ValoraCore (Proxy):     0xBEf897F53AbAF03a11F8B69D90366E886654fFfC
ValoraStakedCell:       0xd742242800406c2e53e7FA2DA8D50d8aef5d70F6
Implementation:         0x94AAc74F5c71a5eb85a9096735Af98F422F54c57
```

### Upgrade Process
```bash
# Обновление реализации контракта
npx hardhat run scripts/upgrade-valoracore.js --network bscTestnet
```

## 🌟 Примеры Использования

### Простой стейкинг
```javascript
// Одобрить токены
await cellToken.approve(valoraCoreAddress, amount);

// Застейкать
await valoraCore.deposit(ethers.parseEther("1000"));

// Проверить sCELL баланс
const sCellBalance = await sCellToken.balanceOf(userAddress);
```

### Создание withdrawal request
```javascript
// Одобрить sCELL токены для сжигания
await sCellToken.approve(valoraCoreAddress, shares);

// Создать withdrawal request
const tx = await valoraCore.requestWithdrawal(shares);
const receipt = await tx.wait();

// Извлечь requestHash из events
const event = receipt.logs.find(log => log.fragment?.name === "WithdrawalRequested");
const requestHash = event.args.requestHash;
```

### Снятие средств
```javascript
// Owner одобряет запрос
await valoraCore.approveWithdrawal(requestHash);

// Пользователь забирает средства
await valoraCore.unstake(requestHash);
```

## 📈 Roadmap

### ✅ Completed (v1.0)
- ✅ Hash-based withdrawal system
- ✅ Multiple withdrawal requests support  
- ✅ UUPS upgradeable architecture
- ✅ BSC Testnet deployment
- ✅ Complete test coverage

### 🚧 In Progress (v1.1)
- 🔄 Mainnet deployment preparation
- 🔄 Multi-validator support
- 🔄 Advanced bridge integration
- 🔄 Security audit

### 📋 Planned (v2.0)
- 📅 Governance token
- 📅 Insurance fund for slashing protection
- 📅 Layer 2 expansion (Arbitrum, Optimism)
- 📅 Mobile app integration

## 🛠️ Для Разработчиков

### Smart Contract Integration
```solidity
interface IValoraCore {
    function deposit(uint256 amount) external;
    function requestWithdrawal(uint256 shares) external returns (bytes32);
    function unstake(bytes32 requestHash) external;
    function exchangeRate() external view returns (uint256);
    function getTotalAssets() external view returns (uint256);
}
```

### Подписка на события
```javascript
valoraCore.on("WithdrawalRequested", (user, requestHash, shares, amount, blockNumber) => {
    console.log(`New withdrawal request: ${requestHash}`);
});

valoraCore.on("WithdrawalCompleted", (requestHash, user, amount) => {
    console.log(`Withdrawal completed: ${amount} CELL`);
});
```

## 🔗 Полезные Ссылки

- **BSCScan (Testnet)**: [ValoraCore Contract](https://testnet.bscscan.com/address/0xBEf897F53AbAF03a11F8B69D90366E886654fFfC)
- **Documentation**: Полная техническая документация в папке `/contracts/docs/`
- **Test Scripts**: Комплексные тесты в папке `/scripts/`

---

**Valora Finance** - это следующее поколение liquid staking протоколов, где **простота**, **безопасность** и **гибкость** объединены в элегантном техническом решении для максимальной эффективности стейкинга CELL токенов. 🚀 
# 🎯 Модульная архитектура ValoraCore с поэтапным запуском withdrawals

## 📋 Обзор архитектуры

**Принцип**: ValoraCore наследует функциональность от специализированных менеджеров с поэтапным запуском.

### 🧩 Модули системы
- **AdminManager**: управление паузами, oracle, withdrawal delay + **поэтапный запуск withdrawals**
- **BridgeManager**: настройки bridge и cross-chain операции  
- **PointsManager**: интеграция с поинт системой
- **ValoraCore**: основная логика стейкинга + наследование всех менеджеров

### 🚦 Логика withdrawals (как в Kelp DAO)
1. **Phase 1**: `withdrawalsEnabled = false` - withdrawals полностью заблокированы
2. **Phase 2**: Админ вызывает `enableWithdrawals()` один раз навсегда
3. **Phase 3**: Withdrawals работают с задержкой `withdrawalDelay` (7 дней)

## 🚀 Deployment Flow

### Phase 1: Только депозиты (Q4 2025)
```solidity
// 1. Deploy ValoraCore (уже содержит все менеджеры)
ValoraCore core = new ValoraCore();

// 2. Initialize со всеми настройками
core.initialize(
    cellTokenAddress,        // CELL token
    sCellTokenAddress,       // sCELL token
    oracleAddress,          // Oracle (AdminManager)
    bridgeAddress,          // Bridge (BridgeManager) 
    nativeChainId,          // Chain ID (BridgeManager)
    validatorAddress        // Validator (BridgeManager)
);

// На этом этапе:
// ✅ AdminManager: oracle, pause, withdrawal delay настроены
// ✅ AdminManager: withdrawalsEnabled = false (НЕ МОЖЕМ делать requestWithdrawal)
// ✅ BridgeManager: bridge и validator настроены
// ✅ PointsManager: pointsContract = address(0), pointsEnabled = false
// ✅ Только депозиты работают, выводы заблокированы
```

### Phase 2: Включение withdrawals навсегда (когда готовы)
```solidity
// Когда команда готова открыть withdrawals (например, через 6 месяцев):

// 1. Enable withdrawals НАВСЕГДА (можно вызвать только ОДИН РАЗ!)
core.enableWithdrawals(); // AdminManager функция

// После этого:
// ✅ withdrawalsEnabled = true 
// ✅ requestWithdrawal() работает
// ✅ completeWithdrawal() работает после delay (7 дней)
// ❌ НЕЛЬЗЯ больше отключить withdrawals!
```

### Phase 3: Запуск поинт программы (Q1 2026)
```solidity
// 1. Deploy ValoraPoints контракт
ValoraPoints points = new ValoraPoints();
points.initialize();

// 2. Authorize ValoraCore to call points functions
points.setContractAuthorization(address(core), true);

// 3. Set points contract в ValoraCore (PointsManager функция)
core.setPointsContract(address(points));

// 4. Enable points system (PointsManager функция)
core.setPointsEnabled(true);

// Теперь поинты начисляются автоматически!
```

## 💻 Withdrawal flow пользователя

### До включения withdrawals
```solidity
// Пользователь может только стейкать:
core.deposit(1000 * 1e18); // ✅ Работает

// Пользователь НЕ МОЖЕТ делать withdrawals:
core.requestWithdrawal(500 * 1e18); // ❌ Revert: "Withdrawals not enabled yet"
```

### После включения withdrawals
```solidity
// 1. Пользователь запрашивает вывод (сжигает sCELL сразу)
core.requestWithdrawal(500 * 1e18); // ✅ Работает
// - sCELL токены сжигаются сразу
// - Создается withdrawal request с unlockTime = block.timestamp + 7 days

// 2. Пользователь ждет 7 дней...

// 3. Пользователь завершает вывод (получает CELL)
core.completeWithdrawal(); // ✅ Работает после delay
// - Получает CELL токены по текущему курсу
// - Withdrawal request удаляется
```

## 🔧 Админские функции

### Управление withdrawals (AdminManager)
```solidity
// Проверить статус withdrawals
(address oracle, bool paused, bool withdrawalsEnabled, uint256 delay) = core.getAdminConfig();
bool available = core.areWithdrawalsAvailable(); // enabled && !paused

// Включить withdrawals НАВСЕГДА (только один раз!)
core.enableWithdrawals(); // После этого нельзя отключить

// Изменить задержку (можно всегда)
core.setWithdrawalDelay(14 days); // Изменить с 7 на 14 дней

// Emergency pause (останавливает ВСЕ операции)
core.pause();
core.unpause();
```

### Управление oracle (AdminManager)
```solidity
// Изменить oracle адрес
core.setOracul(newOracleAddress);

// Oracle делает rebase
core.rebase(newTotalAssets); // Только oracle
```

### Bridge операции (BridgeManager)
```solidity
// Изменить bridge настройки
core.setBridge(newBridgeAddress);
core.setValidatorAddress("CEL", "validator123");

// Проверить конфигурацию
bool configured = core.isBridgeConfigured();
```

### Points операции (PointsManager)
```solidity
// Настроить поинты (когда программа готова)
core.setPointsContract(pointsAddress);
core.setPointsEnabled(true);

// Отключить поинты (после airdrop)
core.setPointsEnabled(false);
```

## 🛡️ Безопасность поэтапного запуска

### Защита пользователей
```solidity
// Phase 1: Только депозиты - пользователи понимают что не могут выводить
// Phase 2: Команда включает withdrawals когда инфраструктура готова
// Phase 3: Withdrawals работают с защитой от run на банк (7 дней delay)
```

### Необратимость решений
```solidity
function enableWithdrawals() external onlyOwner {
    require(!withdrawalsEnabled, "Withdrawals already enabled");
    withdrawalsEnabled = true; // НАВСЕГДА!
    emit WithdrawalsEnabled();
}

// ❌ НЕТ функции disableWithdrawals() - это защита пользователей!
```

### Emergency controls
```solidity
// Админ может остановить ВСЕ операции в emergency:
core.pause(); // Останавливает deposits и withdrawals

// НО НЕ МОЖЕТ отключить сами withdrawals если они уже включены
// Это дает пользователям уверенность в доступе к своим средствам
```

## 💻 Примеры использования

### Пользователь в Phase 1 (только депозиты)
```solidity
// Пользователь стейкает
core.deposit(1000 * 1e18); 
// ✅ Получает sCELL токены
// ✅ Токены отправлены в нативную сеть через bridge

// Пользователь пытается вывести
core.requestWithdrawal(500 * 1e18);
// ❌ Revert: "Withdrawals not enabled yet"

// Пользователь знает что withdrawals будут включены позже
```

### Команда включает withdrawals (переход в Phase 2)
```solidity
// Через 6-12 месяцев команда готова:
core.enableWithdrawals(); 
// ✅ Событие WithdrawalsEnabled()
// ✅ Теперь пользователи могут делать withdrawals
// ❌ Команда НЕ МОЖЕТ больше отключить withdrawals
```

### Пользователь в Phase 2 (полная функциональность)
```solidity
// 1. Запрос вывода
core.requestWithdrawal(500 * 1e18);
// ✅ sCELL сжигается сразу
// ✅ Создается запрос с unlockTime

// 2. Проверка статуса
WithdrawalRequest memory req = core.getWithdrawalRequest(userAddress);
// req.shares = 500e18
// req.unlockTime = block.timestamp + 7 days

// 3. Завершение вывода (через 7 дней)
core.completeWithdrawal();
// ✅ Получает CELL токены
// ✅ Withdrawal request удаляется
```

## 📊 Преимущества поэтапного запуска

### ✅ Защита проекта
- Время для развития инфраструктуры
- Защита от ранних атак на ликвидность
- Возможность набрать TVL перед включением выводов

### ✅ Защита пользователей  
- Понятная roadmap когда включатся withdrawals
- Гарантия что withdrawals нельзя отключить после включения
- Защита от run на банк через withdrawal delay

### ✅ Гибкость для команды
- Можно изменить withdrawal delay даже после включения
- Emergency pause для критических ситуаций
- Постепенное добавление новых функций (поинты, DAO)

## 🚀 Roadmap implementation

### Q4 2025: Запуск депозитов (Phase 1)
```
1. Deploy ValoraCore (withdrawalsEnabled = false)
2. Deploy sCELL
3. Initialize все настройки
4. Начать прием депозитов
5. Пользователи НЕ МОГУТ делать withdrawals
```

### Q2 2026: Включение withdrawals (Phase 2)
```
1. Команда готова к полному запуску
2. core.enableWithdrawals() - включение НАВСЕГДА
3. Пользователи могут делать requestWithdrawal()
4. Withdrawal delay = 7 дней защищает от банк-ранов
```

### Q3 2026: Активация поинт программы (Phase 3)
```
1. Deploy ValoraPoints
2. core.setPointsContract(points)
3. core.setPointsEnabled(true)
4. Retroactive начисление поинтов
```

### Будущие расширения
```
1. Добавление новых менеджеров (FeeManager, GovernanceManager)
2. DAO управление некоторыми параметрами
3. Модульная экосистема с полной функциональностью
```

Такой подход дает максимальную защиту как проекту, так и пользователям! 🎯 
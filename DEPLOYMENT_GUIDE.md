# Гайд по деплою ValoraFinance 🚀

## 🛡️ Security Checklist (ОБЯЗАТЕЛЬНО!)

**ВНИМАНИЕ**: Протокол прошел security audit и готов к production deployment. Убедитесь в соблюдении всех пунктов безопасности:

### ✅ Pre-Deployment Security Checks
- [ ] Все критические уязвимости исправлены (CRITICAL-01, HIGH-01, HIGH-02, MEDIUM-02)
- [ ] Oracle адрес проверен и имеет правильные права доступа
- [ ] Bridge контракт развернут и протестирован
- [ ] Validator адрес в target chain корректен
- [ ] Приватные ключи хранятся безопасно
- [ ] Emergency response team готов
- [ ] Monitoring системы настроены

### ✅ Тестирование перед Mainnet
- [ ] Все тесты проходят: `npx hardhat test`
- [ ] Coverage 95%+: `npx hardhat coverage`
- [ ] Integration тесты в testnet выполнены успешно
- [ ] Attack vector тесты пройдены
- [ ] Edge cases протестированы

## 📋 Подготовка к деплою

### 1. Создайте .env файл
```bash
# Приватный ключ вашего кошелька (без префикса 0x)
PRIVATE_KEY=your_private_key_here_without_0x_prefix

# RPC URL для BSC Testnet/Mainnet
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/
BSC_MAINNET_RPC_URL=https://bsc-dataseed1.binance.org:443/

# API ключ BSCScan для верификации
BSCSCAN_API_KEY=your_bscscan_api_key_here

# Включить отчет по газу
REPORT_GAS=true
```

### 2. Получите средства
**Testnet:**
- Перейдите на https://testnet.bnbchain.org/faucet-smart
- Получите тестовые BNB на свой кошелек

**Mainnet:**
- Убедитесь в достаточном количестве BNB (~0.1 BNB для деплоя)

### 3. Заполните deployment-args.js
```javascript
{
  cellTokenAddress: "0x...", // ПРОВЕРЕНО: Адрес CELL токена
  oracleAddress: "0x...",    // ПРОВЕРЕНО: Ваш trusted oracle адрес  
  bridgeAddress: "0x...",    // ПРОВЕРЕНО: Функционирующий bridge контракт
  validatorAddress: "0x...", // ПРОВЕРЕНО: Корректный validator в target chain
  nativeChainId: "0x010203", // ПРОВЕРЕНО: Правильный chain ID
  network: "bscTestnet" // или "bsc" для mainnet
}
```

## 🚀 Deployment Process

### Security-First Deployment в Testnet:
```bash
# 1. Запустить все тесты
npx hardhat test

# 2. Проверить покрытие  
npx hardhat coverage

# 3. Деплой в testnet с security checks
npx hardhat run scripts/deploy.js --network bscTestnet

# 4. Запустить integration тесты
npx hardhat run scripts/test-integration.js --network bscTestnet
```

### Production Deployment в Mainnet:
```bash
# ТОЛЬКО после успешного testnet deployment!
npx hardhat run scripts/deploy.js --network bsc
```

## 🔧 Что происходит при деплое

Скрипт автоматически выполняет **Security-Enhanced Deployment**:

1. ✅ **ValoraStakedCell деплой** с owner проверками
2. ✅ **ValoraCore деплой** как UUPS upgradeable proxy с валидацией всех параметров:
   - `cellToken != address(0)`
   - `oracle != address(0)` 
   - `bridge != address(0)`
   - `nativeChainId != bytes3(0)`
   - `validatorAddress.length > 0`
3. ✅ **Связь контрактов** с проверками доступа
4. ✅ **Верификация** на BSCScan для прозрачности
5. ✅ **Сохранение результатов** в JSON с security metadata

## 🛡️ Post-Deployment Security

### 1. Немедленные проверки
```bash
# Проверить owner/oracle настройки
npx hardhat run scripts/verify-deployment.js --network [network]

# Тест базового функционала
npx hardhat run scripts/basic-functionality-test.js --network [network]
```

### 2. Monitoring Setup
- Настроить алерты на большие депозиты (>100K CELL)
- Мониторинг rebase операций  
- Отслеживание emergency pause events
- Проверка exchange rate стабильности

### 3. Emergency Procedures
- Контакты emergency response team
- Процедуры для emergency pause: `valoraCore.pause()`
- Backup планы для критических ситуаций
- Связь с bridge операторами

## ⚠️ Security Constants (НЕ ИЗМЕНЯТЬ!)

```solidity
MIN_DEPOSIT = 1e18           // 1 CELL - защита от precision attacks
MAX_DEPOSIT = 10000000 * 1e18 // 10M CELL - защита от overflow
MIN_REBASE_CHANGE = 800      // -20% - защита от oracle manipulation  
MAX_REBASE_CHANGE = 200      // +20% - защита от oracle manipulation
```

## 🚨 Troubleshooting

### Deployment Issues
1. **"Insufficient funds"** - Нужно больше BNB (~0.1 BNB)
2. **"Invalid oracle address"** - Oracle не может быть address(0)
3. **"Invalid bridge address"** - Bridge должен существовать и быть функциональным
4. **"Invalid chain ID"** - nativeChainId не может быть 0x000000
5. **"Invalid validator address"** - validatorAddress не может быть пустым

### Security Issues
1. **"Rebase exceeds safety limits"** - Oracle пытается изменить курс >±20%
2. **"Amount too small"** - Депозит меньше MIN_DEPOSIT (1 CELL)
3. **"Deposit amount too large"** - Депозит больше MAX_DEPOSIT (10M CELL)
4. **"Precision loss too high"** - Система защищает от unfair exchange

### Emergency Response
1. **Pause контракт**: `valoraCore.pause()` (только owner)
2. **Проверить oracle**: `valoraCore.oracul()`
3. **Проверить bridge**: `valoraCore.getBridgeConfig()`
4. **Связаться с командой**: [emergency contacts]

## 📊 Success Metrics

После успешного деплоя проверьте:
- [ ] Контракты верифицированы на BSCScan
- [ ] Oracle может выполнять rebase в пределах ±20%
- [ ] Пользователи могут делать депозиты ≥1 CELL
- [ ] sCELL токены корректно минтятся
- [ ] Bridge операции работают
- [ ] Emergency pause функционирует
- [ ] Withdrawal система работает корректно

## 🔗 Полезные ссылки

- **Security Audit**: [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md)
- **BSC Testnet Faucet**: https://testnet.bnbchain.org/faucet-smart
- **BSCScan Testnet**: https://testnet.bscscan.com/
- **BSCScan Mainnet**: https://bscscan.com/
- **BSCScan API Keys**: https://bscscan.com/apis

---

**⚠️ ВНИМАНИЕ**: Это production-ready протокол с enterprise-grade безопасностью. Соблюдение всех security procedures ОБЯЗАТЕЛЬНО! 🔒 
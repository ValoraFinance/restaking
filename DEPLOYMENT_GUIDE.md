# Гайд по деплою ValoraFinance в BSC Testnet

## Подготовка к деплою

### 1. Создайте .env файл
Скопируйте пример и заполните реальными значениями:

```bash
# Приватный ключ вашего кошелька (без префикса 0x)
PRIVATE_KEY=your_private_key_here_without_0x_prefix

# RPC URL для BSC Testnet
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/

# API ключ BSCScan для верификации
BSCSCAN_API_KEY=your_bscscan_api_key_here

# Включить отчет по газу
REPORT_GAS=true
```

### 2. Получите тестовые BNB для BSC Testnet
- Перейдите на https://testnet.bnbchain.org/faucet-smart
- Получите тестовые BNB на свой кошелек

### 3. Заполните deployment-args.js
Обновите адреса в файле `deployment-args.js`:

```javascript
{
  cellTokenAddress: "0x...", // Адрес CELL токена в BSC Testnet
  oracleAddress: "0x...",    // Ваш адрес оракула
  bridgeAddress: "0x...",    // Адрес bridge контракта
  validatorAddress: "0x...", // Адрес валидатора
  network: "bscTestnet"
}
```

## Деплой

### Запуск деплоя в BSC Testnet:
```bash
npx hardhat run scripts/deploy.js --network bscTestnet
```

### Запуск деплоя в BSC Mainnet:
```bash
npx hardhat run scripts/deploy.js --network bsc
```

## После деплоя

Скрипт автоматически:
1. ✅ Задеплоит ValoraStakedCell
2. ✅ Задеплоит ValoraCore как upgradeable proxy
3. ✅ Настроит связь между контрактами
4. ✅ Верифицирует контракты на Etherscan
5. ✅ Сохранит результаты в JSON файл

## Возможные проблемы

1. **"Insufficient funds"** - Нужно больше ETH на кошельке
2. **"Invalid private key"** - Проверьте формат приватного ключа в .env
3. **"Network not found"** - Проверьте название сети в команде
4. **Верификация не прошла** - Возможно нужно подождать несколько минут

## Полезные ссылки

- [Sepolia Faucet](https://sepolia-faucet.pk910.de/)
- [Etherscan Sepolia](https://sepolia.etherscan.io/)
- [Etherscan API Keys](https://etherscan.io/apis)
- [Infura](https://infura.io/) - для RPC URL 
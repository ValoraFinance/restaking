# Гайд по деплою ValoraFinance в Sepolia

## Подготовка к деплою

### 1. Создайте .env файл
Скопируйте пример и заполните реальными значениями:

```bash
# Приватный ключ вашего кошелька (без префикса 0x)
PRIVATE_KEY=your_private_key_here_without_0x_prefix

# RPC URL для Sepolia (можно получить на Infura/Alchemy)
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID

# API ключ Etherscan для верификации
ETHERSCAN_API_KEY=your_etherscan_api_key_here

# Включить отчет по газу
REPORT_GAS=true
```

### 2. Получите тестовые ETH для Sepolia
- Перейдите на https://sepolia-faucet.pk910.de/ или https://sepoliafaucet.com/
- Получите тестовые ETH на свой кошелек

### 3. Заполните deployment-args.js
Обновите адреса в файле `deployment-args.js`:

```javascript
{
  cellTokenAddress: "0x...", // Адрес CELL токена в Sepolia
  oracleAddress: "0x...",    // Ваш адрес оракула
  bridgeAddress: "0x...",    // Адрес bridge контракта
  validatorAddress: "0x...", // Адрес валидатора
  network: "sepolia"
}
```

## Деплой

### Запуск деплоя в Sepolia:
```bash
npx hardhat run scripts/deploy.js --network sepolia
```

### Запуск деплоя в Ethereum mainnet:
```bash
npx hardhat run scripts/deploy.js --network ethereum
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
# API de Alimentos - Integração

Documentação para integração com a API de Alimentos e Nutrição.

## Informações da API

| Item | Valor |
|------|-------|
| URL Base | `https://api.olym.com.br` |
| Endpoint de Busca | `GET /foods?q={termo}` |
| Autenticação | Header `x-api-key` (apenas endpoints admin) |

## Endpoints Públicos

### Buscar Alimentos

```
GET https://api.olym.com.br/foods?q=arroz
```

Parâmetros de query:
- `q` - Termo de busca (ex: "arroz", "frango")
- `page` - Página (default: 1)
- `size` - Itens por página (default: 20, max: 100)
- `group` - Filtrar por grupo (ex: "Cereais e derivados")
- `source` - Filtrar por tabela: `TACO` ou `TBCA`

Resposta:
```json
{
  "data": [
    {
      "id": 1,
      "description": "Arroz, tipo 1, cozido",
      "groupName": "Cereais e derivados",
      "sourceTable": "TACO",
      "portionGrams": 100
    }
  ],
  "meta": {
    "total": 50,
    "page": 1,
    "size": 20,
    "totalPages": 3
  }
}
```

### Detalhes do Alimento (com nutrientes)

```
GET https://api.olym.com.br/foods/{id}
```

Resposta:
```json
{
  "id": 1,
  "description": "Arroz, tipo 1, cozido",
  "groupName": "Cereais e derivados",
  "sourceTable": "TACO",
  "portionGrams": 100,
  "nutrients": [
    { "id": 1, "name": "Energia", "unit": "kcal", "valuePer100g": 128 },
    { "id": 2, "name": "Proteína", "unit": "g", "valuePer100g": 2.5 },
    { "id": 3, "name": "Carboidrato", "unit": "g", "valuePer100g": 28.1 },
    { "id": 4, "name": "Lipídeos", "unit": "g", "valuePer100g": 0.2 }
  ],
  "measures": [
    { "id": 1, "measureDescription": "1 colher de sopa", "grams": 25 },
    { "id": 2, "measureDescription": "1 xícara", "grams": 160 }
  ]
}
```

### Calcular Nutrição por Porção

```
POST https://api.olym.com.br/foods/{id}/calculate
Content-Type: application/json

{
  "amount_grams": 150
}
```

Resposta:
```json
{
  "foodId": 1,
  "foodDescription": "Arroz, tipo 1, cozido",
  "amountGrams": 150,
  "nutrients": [
    { "name": "Energia", "unit": "kcal", "calculatedValue": 192 },
    { "name": "Proteína", "unit": "g", "calculatedValue": 3.75 }
  ]
}
```

### Listar Nutrientes

```
GET https://api.olym.com.br/nutrients
```

### Listar Medidas Caseiras

```
GET https://api.olym.com.br/measures?foodId={id}
```

## Endpoints Admin (requer API Key)

Header obrigatório: `x-api-key: {sua-chave}`

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | /foods | Cadastrar alimento |
| PUT | /foods/{id} | Atualizar alimento |
| DELETE | /foods/{id} | Excluir alimento |
| POST | /admin/import/taco | Importar dados TACO |
| POST | /admin/import/tbca | Importar dados TBCA |

## Exemplo de Uso (TypeScript)

```typescript
const FOOD_API_URL = 'https://api.olym.com.br';

interface Food {
  id: number;
  description: string;
  groupName: string;
  sourceTable: 'TACO' | 'TBCA';
  portionGrams: number;
}

interface FoodSearchResponse {
  data: Food[];
  meta: { total: number; page: number; size: number; totalPages: number };
}

async function searchFoods(query: string): Promise<FoodSearchResponse> {
  const response = await fetch(`${FOOD_API_URL}/foods?q=${encodeURIComponent(query)}`);
  return response.json();
}

async function getFoodDetails(id: number) {
  const response = await fetch(`${FOOD_API_URL}/foods/${id}`);
  return response.json();
}

// Uso
const results = await searchFoods('frango');
console.log(results.data);
```

## Tabelas de Origem

- **TACO**: Tabela Brasileira de Composição de Alimentos (UNICAMP)
- **TBCA**: Tabela Brasileira de Composição de Alimentos (USP)

import { NotFoundError } from '@vtex/api'
import pLimit from 'p-limit'

import {
  QUOTE_DATA_ENTITY,
  QUOTE_FIELDS,
  SCHEMA_VERSION,
} from '../../constants'
import {
  costCenterName as getCostCenterName,
  organizationName as getOrganizationName,
} from '../fieldResolvers'

type GetQuotesArgs = {
  page?: number
  pageSize?: number
  where?: string
  sort?: string
}

export default class SellerQuotesController {
  constructor(private readonly ctx: Context, private readonly seller: string) {}

  private async getSellerQuotes({
    page = 1,
    pageSize = 1,
    where = '',
    sort = '',
  }: GetQuotesArgs) {
    return this.ctx.clients.masterdata.searchDocumentsWithPaginationInfo<Quote>(
      {
        dataEntity: QUOTE_DATA_ENTITY,
        fields: QUOTE_FIELDS,
        schema: SCHEMA_VERSION,
        pagination: { page, pageSize },
        where: `seller=${this.seller} AND (${where})`,
        sort,
      }
    )
  }

  private async getSellerQuote(id: string) {
    const { data } = await this.getSellerQuotes({ where: `id=${id}` })
    const [quote] = data

    if (!quote) {
      throw new NotFoundError('seller-quote-not-found')
    }

    return quote
  }

  private async getOrganizationData(quote: Quote) {
    const [organizationName, costCenterName] = await Promise.all([
      getOrganizationName({ organization: quote.organization }, null, this.ctx),
      getCostCenterName({ costCenter: quote.costCenter }, null, this.ctx),
    ])

    return { organizationName, costCenterName }
  }

  public async getFullSellerQuote(id: string) {
    const quote = await this.getSellerQuote(id)
    const { organizationName, costCenterName } = await this.getOrganizationData(
      quote
    )

    return { ...quote, organizationName, costCenterName }
  }

  public async getSellerQuotesPaginated(
    page: number,
    pageSize: number,
    where?: string
  ) {
    const { data, pagination } = await this.getSellerQuotes({
      page,
      pageSize,
      where,
      sort: 'creationDate DESC',
    })

    const limit = pLimit(15)
    const enrichedQuotes = await Promise.all(
      data.map((quote) =>
        limit(async () => {
          const {
            organizationName,
            costCenterName,
          } = await this.getOrganizationData(quote)

          return { ...quote, organizationName, costCenterName }
        })
      )
    )

    return {
      data: enrichedQuotes,
      pagination,
    }
  }
}

import type { JsonDataQuote } from '../clients/email'
import type MailClient from '../clients/email'
import type StorefrontPermissions from '../clients/storefrontPermissions'
import { sendMessageMetric } from '../metrics/sendMessage'

interface QuoteUpdate {
  email: string
  status: string
  note: string
}

// As this is currently used only to get the sales-admin users to
// send an email notification when a quote is created, we only get
// the first page of users (25) and return them.
// If there is a new use case where we need to get all users,
// we need to implement pagination properly.
const getUsers = async (
  storefrontPermissions: StorefrontPermissions,
  roleSlug: string,
  organizationId?: string
) => {
  const {
    data: { listRoles },
  }: any = await storefrontPermissions.listRoles()

  const role = listRoles.find((r: any) => r.slug === roleSlug)

  if (!role) {
    return []
  }

  const {
    data: { listUsersPaginated },
  }: any = await storefrontPermissions.listUsersPaginated({
    roleId: role.id,
    ...(organizationId && { organizationId }),
  })

  // we only return the first page of users (25)
  return listUsersPaginated.data
}

const getOrgAndCostCenterNames = async (
  ctx: Context | EventBroadcastContext,
  organizationId: string,
  costCenterId: string
) => {
  const {
    clients: { organizations },
    vtex: { logger },
  } = ctx

  try {
    const {
      data: {
        getOrganizationById: { name: organizationName },
      },
    } = await organizations.getOrganizationById(organizationId)

    const {
      data: {
        getCostCenterById: { name: costCenterName },
      },
    } = await organizations.getCostCenterById(costCenterId)

    return { organizationName, costCenterName }
  } catch (error) {
    logger.error({
      error,
      message: 'quoteUpdatedMessage-getOrgNamesError',
    })

    return { organizationName: null, costCenterName: null }
  }
}

const sendNotificationToUser = async (
  mailClient: MailClient,
  user: string,
  quote: JsonDataQuote,
  templateName: string,
  account: string
) => {
  await mailClient.sendMail({
    jsonData: {
      message: { to: user },
      quote,
    },
    templateName,
  })

  sendMessageMetric({
    quote,
    account,
    sentTo: user,
    templateName,
  })
}

const sendMailNotificationToUsers = async (
  ctx: Context | EventBroadcastContext,
  { quote, mail: sender, users }: any,
  templateName: string
) => {
  const {
    vtex: { logger },
  } = ctx

  try {
    const promises = []

    for (const user of users) {
      promises.push(
        sendNotificationToUser(
          sender,
          user,
          quote,
          templateName,
          sender.context.account
        )
      )
    }

    return Promise.all(promises)
  } catch (error) {
    logger.error({
      error,
      message: 'sendMailNotificationToUsers-Error',
    })
  }

  return false
}

const message = (ctx: Context | EventBroadcastContext) => {
  const {
    clients: { mail, storefrontPermissions },
    vtex: { logger, host },
  } = ctx

  let rootPath = 'get' in ctx ? ctx.get('x-vtex-root-path') : '/'

  // Defend against malformed root path. It should always start with `/`.
  if (rootPath && !rootPath.startsWith('/')) {
    rootPath = `/${rootPath}`
  }

  if (rootPath === '/') {
    rootPath = ''
  }

  const quoteCreated = async ({
    name,
    id,
    organization,
    costCenter,
    lastUpdate,
  }: {
    name: string
    id: string
    organization: string
    costCenter: string
    lastUpdate: QuoteUpdate
  }) => {
    let users = []

    try {
      users = (await getUsers(storefrontPermissions, 'sales-admin', organization)).map(
        (user: any) => user.email
      )
    } catch (error) {
      logger.error({
        error,
        message: 'quoteCreatedMessage-getUsersError',
      })
    }

    const { organizationName, costCenterName } = await getOrgAndCostCenterNames(
      ctx,
      organization,
      costCenter
    )

    if (!organizationName || !costCenterName || users.length === 0) {
      return
    }

    const link = `https://${host}${rootPath}/b2b-quotes/${id}`
    const quote = {
      costCenter: costCenterName,
      id,
      lastUpdate,
      link,
      name,
      organization: organizationName,
    }

    return sendMailNotificationToUsers(
      ctx,
      { quote, mail, users },
      'quote-created'
    )
  }

  const quoteUpdated = async ({
    users,
    name,
    id,
    organization,
    costCenter,
    lastUpdate,
    templateName = 'quote-updated',
    orderId = '',
  }: {
    users: string[]
    name: string
    id: string
    organization: string
    costCenter: string
    lastUpdate: QuoteUpdate
    templateName?: string
    orderId?: string
  }) => {
    const { organizationName, costCenterName } = await getOrgAndCostCenterNames(
      ctx,
      organization,
      costCenter
    )

    if (!organizationName || !costCenterName) {
      return
    }

    const link = `https://${host}${rootPath}/b2b-quotes/${id}`
    const quote = {
      costCenter: costCenterName,
      id,
      lastUpdate,
      link,
      name,
      orderId,
      organization: organizationName,
    }

    return sendMailNotificationToUsers(
      ctx,
      { quote, mail, users, ctx },
      templateName
    )
  }

  return {
    quoteCreated,
    quoteUpdated,
  }
}

export default message

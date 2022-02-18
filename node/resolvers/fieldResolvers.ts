export const organizationName = async (
  { organization }: { organization: string },
  _: any,
  ctx: Context
) => {
  const {
    clients: { organizations },
    vtex: { logger },
  } = ctx

  try {
    const organizationData = await organizations.getOrganizationById(
      organization
    )

    return organizationData?.data?.getOrganizationById?.name ?? null
  } catch (e) {
    logger.warn({
      message: 'getOrganizationName-error',
      e,
    })
  }
}

export const costCenterName = async (
  { costCenter }: { costCenter: string },
  _: any,
  ctx: Context
) => {
  const {
    clients: { organizations },
    vtex: { logger },
  } = ctx

  try {
    const costCenterData = await organizations.getCostCenterById(costCenter)

    return costCenterData?.data?.getCostCenterById?.name ?? null
  } catch (e) {
    logger.warn({
      message: 'getCostCenterName-error',
      e,
    })
  }
}

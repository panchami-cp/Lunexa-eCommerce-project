const Address = require('../model/addressSchema')
const Order = require('../model/orderSchema')

async function getAddress(addressId){
    const selectedAddressDoc = await Address.findOne(
    { 'address._id': addressId },
    { 'address.$': 1 }
  )
  if (!selectedAddressDoc || !selectedAddressDoc.address || selectedAddressDoc.address.length === 0) {
    throw new Error('Address not found')
  }
  const selectedAddress = selectedAddressDoc.address[0]
   return {
    name: selectedAddress.name,
    building: selectedAddress.building,
    area: selectedAddress.area,
    landmark: selectedAddress.landmark,
    city: selectedAddress.city,
    state: selectedAddress.state,
    pincode: selectedAddress.pincode,
    phone: selectedAddress.phone,
    alternatePhone: selectedAddress.alternatePhone,
  }
}

async function createNewOrder(userId, cart, addressId, appliedCoupon = null){
try {

    const orderAddress = await getAddress(addressId)
    const newOrder = new Order({
        userId: userId,
        items: cart.items,
        totalMRP: cart.totalMRP,
        totalDiscount: cart.totalDiscount,
        address: orderAddress,
        couponDiscount : appliedCoupon? appliedCoupon.discountAmount : 0,
        finalAmount : appliedCoupon ? appliedCoupon.payableAmount : cart.totalCartPrice,
        coupon : appliedCoupon? appliedCoupon.couponId: null
    })
    return newOrder
} catch (error) {
    console.error('Error creating new order:', error)
    throw error
}
}

module.exports = {
    getAddress,
    createNewOrder
}